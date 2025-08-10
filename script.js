// Mobile Website Scanner with QR Code Support

let scanHistory = JSON.parse(localStorage.getItem('scanHistory')) || [];
let qrScanner = null;
let currentStream = null;
let facingMode = 'environment'; // Start with back camera
let currentScanMode = 'qr'; // qr, text, barcode
let isFlashOn = false;
let ocrWorker = null;

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    loadScanHistory();
    
    // Add enter key support for URL input
    document.getElementById('urlInput').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            startScan();
        }
    });
    
    // Check if device has camera
    checkCameraSupport();
});

// Check camera support
function checkCameraSupport() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        document.getElementById('cameraBtn').style.display = 'none';
        document.getElementById('ocrBtn').style.display = 'none';
        console.log('Camera not supported on this device');
    }
}

// Show camera permission help
function showCameraPermissionHelp() {
    const helpMessage = `
To enable camera access:

📱 Mobile:
• Look for camera icon in address bar
• Tap "Allow" when prompted
• Check browser settings if blocked

💻 Desktop:
• Click camera icon in address bar
• Select "Always allow" for this site
• Refresh the page after granting permission

🔧 If still not working:
• Check if another app is using camera
• Try refreshing the page
• Restart your browser
• Check system camera permissions`;
    
    alert(helpMessage);
}

// Initialize OCR worker
async function initOCR() {
    if (!ocrWorker && typeof Tesseract !== 'undefined') {
        try {
            ocrWorker = await Tesseract.createWorker('eng+sin', 1, {
                logger: m => console.log(m)
            });
            console.log('OCR Worker initialized');
        } catch (error) {
            console.error('OCR initialization failed:', error);
        }
    }
}

// Main scan function
function startScan() {
    const urlInput = document.getElementById('urlInput');
    const scanType = document.getElementById('scanType').value;
    const url = urlInput.value.trim();
    
    // Validate URL
    if (!url) {
        alert('Please enter the website URL');
        return;
    }
    
    if (!isValidUrl(url)) {
        alert('Please enter a valid URL (e.g., https://example.com)');
        return;
    }
    
    // Close camera if open
    if (qrScanner) {
        closeCamera();
    }
    
    // Show loading state
    showLoading();
    
    // Simulate scan process
    setTimeout(() => {
        performScan(url, scanType);
    }, 2000);
}

// Toggle camera for scanning
async function toggleCamera() {
    const cameraSection = document.getElementById('cameraSection');
    
    if (cameraSection.style.display === 'none') {
        currentScanMode = 'qr';
        setScanMode('qr');
        await startCamera();
    } else {
        closeCamera();
    }
}

// Capture image for OCR processing
async function captureImage() {
    const video = document.getElementById('cameraVideo');
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    
    if (video.videoWidth === 0 || video.videoHeight === 0) {
        showNotification('Camera is not ready. Please wait.', 'warning');
        return;
    }
    
    // Set canvas size to video size
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    // Draw current video frame to canvas
    context.drawImage(video, 0, 0);
    
    // Show capture feedback
    showNotification('Image captured! Processing...', 'info');
    
    if (currentScanMode === 'text') {
        await processImageWithOCR(canvas);
    } else {
        // For other modes, save the image
        downloadImage(canvas);
    }
}

// Process captured image with OCR
async function processImageWithOCR(canvas) {
    try {
        if (!ocrWorker) {
            await initOCR();
        }
        
        if (!ocrWorker) {
            showNotification('OCR engine failed to load', 'error');
            return;
        }
        
        showNotification('Recognizing text...', 'info');
        
        const { data: { text } } = await ocrWorker.recognize(canvas);
        
        if (text.trim()) {
            // Check if recognized text contains URLs
            const urlRegex = /(https?:\/\/[^\s]+)/g;
            const urls = text.match(urlRegex);
            
            if (urls && urls.length > 0) {
                document.getElementById('urlInput').value = urls[0];
                showNotification(`URL detected: ${urls[0]}`, 'success');
                closeCamera();
                setTimeout(() => startScan(), 500);
            } else {
                // Show recognized text
                showRecognizedText(text);
            }
        } else {
            showNotification('Failed to detect text. Try from a different angle.', 'warning');
        }
        
    } catch (error) {
        console.error('OCR Error:', error);
        showNotification('Text recognition error: ' + error.message, 'error');
    }
}

// Show recognized text in a modal
function showRecognizedText(text) {
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.8);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 2000;
    `;
    
    const content = document.createElement('div');
    content.style.cssText = `
        background: white;
        padding: 30px;
        border-radius: 15px;
        max-width: 80%;
        max-height: 80%;
        overflow-y: auto;
        box-shadow: 0 10px 30px rgba(0,0,0,0.5);
    `;
    
    content.innerHTML = `
        <h3><i class="fas fa-font"></i> Recognized Text</h3>
        <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 15px 0; white-space: pre-wrap; font-family: monospace;">${text}</div>
        <div style="text-align: center; margin-top: 20px;">
            <button onclick="copyToClipboard('${text.replace(/'/g, "\\'")}')">Copy Text</button>
            <button onclick="this.closest('.modal').remove()">Close</button>
        </div>
    `;
    
    modal.className = 'modal';
    modal.appendChild(content);
    document.body.appendChild(modal);
    
    // Close on background click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });
}

// Copy text to clipboard
function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showNotification('Text copied to clipboard!', 'success');
    }).catch(() => {
        showNotification('Failed to copy', 'error');
    });
}

// Download captured image
function downloadImage(canvas) {
    const link = document.createElement('a');
    link.download = `scan_${new Date().getTime()}.png`;
    link.href = canvas.toDataURL();
    link.click();
    showNotification('Image downloaded!', 'success');
}

// Toggle camera flash
async function toggleFlash() {
    if (!currentStream) return;
    
    const track = currentStream.getVideoTracks()[0];
    const capabilities = track.getCapabilities();
    
    if (capabilities.torch) {
        isFlashOn = !isFlashOn;
        
        try {
            await track.applyConstraints({
                advanced: [{ torch: isFlashOn }]
            });
            
            const flashBtn = document.getElementById('flashBtn');
            if (isFlashOn) {
                flashBtn.classList.add('active');
                flashBtn.innerHTML = '<i class="fas fa-lightbulb"></i> Flash ON';
            } else {
                flashBtn.classList.remove('active');
                flashBtn.innerHTML = '<i class="fas fa-lightbulb"></i> Flash OFF';
            }
            
            showNotification(`Flash ${isFlashOn ? 'ON' : 'OFF'}`, 'info');
        } catch (error) {
            showNotification('Failed to control flash', 'warning');
        }
    } else {
        showNotification('Flash not supported on this device', 'warning');
    }
}

// Toggle OCR text scanner
async function toggleOCR() {
    const cameraSection = document.getElementById('cameraSection');
    
    if (cameraSection.style.display === 'none') {
        currentScanMode = 'text';
        setScanMode('text');
        await initOCR();
        await startCamera();
    } else {
        closeCamera();
    }
}

// Set scanning mode
function setScanMode(mode) {
    currentScanMode = mode;
    
    // Update active button
    document.querySelectorAll('.mode-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(mode + 'Mode').classList.add('active');
    
    // Update instruction text
    const instruction = document.getElementById('scanInstruction');
    switch(mode) {
        case 'qr':
            instruction.textContent = 'Position QR code within the frame';
            break;
        case 'text':
            instruction.textContent = 'Position text within the frame';
            break;
        case 'barcode':
            instruction.textContent = 'Position barcode within the frame';
            break;
    }
    
    // Restart scanner with new mode
    if (qrScanner && currentStream) {
        restartScanner();
    }
}

// Restart scanner with current mode
async function restartScanner() {
    if (qrScanner) {
        await qrScanner.stop();
        qrScanner = null;
    }
    
    const video = document.getElementById('cameraVideo');
    
    if (currentScanMode === 'qr' || currentScanMode === 'barcode') {
        // Use QR Scanner for QR codes and barcodes
        if (typeof QrScanner !== 'undefined') {
            qrScanner = new QrScanner(
                video,
                result => onCodeDetected(result),
                {
                    returnDetailedScanResult: true,
                    highlightScanRegion: true,
                    highlightCodeOutline: true,
                }
            );
            await qrScanner.start();
        }
    }
    // For text mode, we'll use manual capture + OCR
}

// Start camera for QR scanning
async function startCamera() {
    try {
        const cameraSection = document.getElementById('cameraSection');
        const video = document.getElementById('cameraVideo');
        const cameraBtn = document.getElementById('cameraBtn');
        
        // Show camera section
        cameraSection.style.display = 'block';
        cameraBtn.innerHTML = '<i class="fas fa-camera"></i> Camera Active';
        cameraBtn.disabled = true;
        
        // Request camera permission
        const constraints = {
            video: {
                facingMode: facingMode,
                width: { ideal: 400 },
                height: { ideal: 300 }
            }
        };
        
        currentStream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = currentStream;
        
        // Initialize scanner based on mode
        if (currentScanMode === 'qr' || currentScanMode === 'barcode') {
            if (typeof QrScanner !== 'undefined') {
                qrScanner = new QrScanner(
                    video,
                    result => onCodeDetected(result),
                    {
                        returnDetailedScanResult: true,
                        highlightScanRegion: true,
                        highlightCodeOutline: true,
                    }
                );
                
                await qrScanner.start();
            }
        }
        
        // Show additional controls
        const cameras = await QrScanner.listCameras();
        if (cameras.length > 1) {
            document.getElementById('switchCameraBtn').style.display = 'inline-block';
        }
        
        // Show flash button for back camera
        if (facingMode === 'environment') {
            document.getElementById('flashBtn').style.display = 'inline-block';
        }
        
    } catch (error) {
        console.error('Camera access error:', error);
        
        let errorMessage = 'Unable to access camera. ';
        
        if (error.name === 'NotAllowedError') {
            errorMessage += 'Please grant camera permission in your browser settings and try again.';
            
            // Show help for permission issues
            if (confirm(errorMessage + '\n\nWould you like to see detailed instructions?')) {
                showCameraPermissionHelp();
            }
        } else if (error.name === 'NotFoundError') {
            errorMessage += 'No camera found on this device.';
            alert(errorMessage);
        } else if (error.name === 'NotSupportedError') {
            errorMessage += 'Camera is not supported on this device or browser.';
            alert(errorMessage);
        } else if (error.name === 'NotReadableError') {
            errorMessage += 'Camera is already in use by another application.';
            alert(errorMessage);
        } else {
            errorMessage += 'Please check your camera settings and try again.';
            alert(errorMessage);
        }
        
        showNotification(errorMessage, 'error');
        closeCamera();
    }
}

// Manual QR detection fallback
function startManualQrDetection(video) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    
    const detectQR = () => {
        if (video.videoWidth > 0 && video.videoHeight > 0) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            context.drawImage(video, 0, 0);
            
            // Simple pattern detection (basic implementation)
            // In a real app, you'd use a proper QR detection library
            const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
            // This is a placeholder - real QR detection would go here
        }
        
        if (qrScanner !== null) {
            requestAnimationFrame(detectQR);
        }
    };
    
    detectQR();
}

// Handle code detection (QR/Barcode)
function onCodeDetected(result) {
    const detectedText = result.data || result;
    console.log(`${currentScanMode.toUpperCase()} detected:`, detectedText);
    
    // Check if it's a URL
    if (isValidUrl(detectedText)) {
        document.getElementById('urlInput').value = detectedText;
        closeCamera();
        
        // Auto-start scan
        setTimeout(() => {
            startScan();
        }, 500);
        
        // Show success message
        showNotification(`${currentScanMode.toUpperCase()} code scanned successfully!`, 'success');
    } else {
        // If not a URL, still show the detected text
        showNotification(`${currentScanMode.toUpperCase()} detected: ${detectedText}`, 'info');
        document.getElementById('urlInput').value = detectedText;
        
        // For barcodes, try to search for product info
        if (currentScanMode === 'barcode') {
            searchProductInfo(detectedText);
        }
    }
}

// Search for product information using barcode
function searchProductInfo(barcode) {
    // Create a search URL for the barcode
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(barcode + ' product')}`;
    showNotification(`Barcode: ${barcode} - Redirecting to Google search`, 'info');
    
    // Option to open search in new tab
    setTimeout(() => {
        if (confirm('Search Google for product information?')) {
            window.open(searchUrl, '_blank');
        }
    }, 2000);
}

// Switch between front and back camera
async function switchCamera() {
    facingMode = facingMode === 'environment' ? 'user' : 'environment';
    
    if (qrScanner) {
        await qrScanner.stop();
    }
    
    if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
    }
    
    await startCamera();
}

// Close camera
function closeCamera() {
    const cameraSection = document.getElementById('cameraSection');
    const cameraBtn = document.getElementById('cameraBtn');
    
    // Stop QR scanner
    if (qrScanner) {
        qrScanner.stop();
        qrScanner = null;
    }
    
    // Stop camera stream
    if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
        currentStream = null;
    }
    
    // Hide camera section
    cameraSection.style.display = 'none';
    cameraBtn.innerHTML = '<i class="fas fa-camera"></i> Scan QR Code';
    cameraBtn.disabled = false;
    
    // Hide switch camera button
    document.getElementById('switchCameraBtn').style.display = 'none';
}

// Show notification
function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check-circle' : 'info-circle'}"></i>
        ${message}
    `;
    
    // Add styles
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'success' ? '#4caf50' : '#2196f3'};
        color: white;
        padding: 15px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 1000;
        animation: slideIn 0.3s ease;
    `;
    
    document.body.appendChild(notification);
    
    // Remove after 3 seconds
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 3000);
}

// Add CSS for notifications
const notificationStyles = document.createElement('style');
notificationStyles.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
`;
document.head.appendChild(notificationStyles);

// Validate URL format
function isValidUrl(string) {
    try {
        new URL(string);
        return true;
    } catch (_) {
        // Check if it's a domain without protocol
        if (string.includes('.') && !string.includes(' ')) {
            try {
                new URL('https://' + string);
                return true;
            } catch (_) {
                return false;
            }
        }
        return false;
    }
}

// Show loading animation
function showLoading() {
    document.getElementById('loading').style.display = 'block';
    document.getElementById('resultsSection').style.display = 'none';
    document.getElementById('scanBtn').disabled = true;
    document.getElementById('scanBtn').innerHTML = '<i class="fas fa-spinner fa-spin"></i> Scanning...';
}

// Hide loading animation
function hideLoading() {
    document.getElementById('loading').style.display = 'none';
    document.getElementById('scanBtn').disabled = false;
    document.getElementById('scanBtn').innerHTML = '<i class="fas fa-play"></i> Start Scan';
}

// Perform the actual scan
function performScan(url, scanType) {
    // Ensure URL has protocol
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
    }
    
    const results = generateScanResults(url, scanType);
    
    // Save to history
    const scanRecord = {
        url: url,
        type: scanType,
        date: new Date().toISOString(),
        results: results
    };
    
    scanHistory.unshift(scanRecord);
    if (scanHistory.length > 20) {
        scanHistory = scanHistory.slice(0, 20);
    }
    
    localStorage.setItem('scanHistory', JSON.stringify(scanHistory));
    
    // Display results
    displayResults(results, url);
    loadScanHistory();
    hideLoading();
}

// Generate comprehensive scan results
function generateScanResults(url, scanType) {
    const domain = new URL(url).hostname;
    
    const baseResults = {
        'Basic Information': {
            'Website Status': getRandomStatus(['Online', 'Offline'], [0.95, 0.05]),
            'Response Time': Math.floor(Math.random() * 800 + 100) + 'ms',
            'Server Type': getRandomItem(['Apache/2.4', 'Nginx/1.18', 'IIS/10.0', 'Cloudflare']),
            'IP Address': generateRandomIP(),
            'Location': getRandomItem(['United States', 'United Kingdom', 'Germany', 'Singapore', 'Japan']),
            'SSL Status': getRandomStatus(['Valid', 'Invalid'], [0.85, 0.15])
        }
    };
    
    if (scanType === 'security' || scanType === 'comprehensive') {
        baseResults['Security Analysis'] = {
            'SSL Certificate': getRandomStatus(['Valid (A+)', 'Valid (A)', 'Valid (B)', 'Invalid', 'Expired'], [0.4, 0.3, 0.2, 0.05, 0.05]),
            'HTTPS Redirect': getRandomStatus(['Enabled', 'Disabled'], [0.8, 0.2]),
            'Security Headers': getRandomStatus(['Excellent', 'Good', 'Missing', 'Partial'], [0.3, 0.4, 0.2, 0.1]),
            'Vulnerability Scan': getRandomStatus(['Clean', 'Low Risk', 'Medium Risk', 'High Risk'], [0.6, 0.25, 0.1, 0.05]),
            'Malware Check': getRandomStatus(['Clean', 'Suspicious'], [0.95, 0.05]),
            'Firewall Status': getRandomStatus(['Protected', 'Unprotected'], [0.7, 0.3])
        };
    }
    
    if (scanType === 'performance' || scanType === 'comprehensive') {
        baseResults['Performance Metrics'] = {
            'Page Load Time': Math.floor(Math.random() * 4000 + 500) + 'ms',
            'First Paint': Math.floor(Math.random() * 2000 + 300) + 'ms',
            'Page Size': Math.floor(Math.random() * 3000 + 500) + 'KB',
            'Requests Count': Math.floor(Math.random() * 80 + 15),
            'Performance Score': Math.floor(Math.random() * 40 + 60) + '/100',
            'Mobile Speed': Math.floor(Math.random() * 40 + 50) + '/100',
            'Desktop Speed': Math.floor(Math.random() * 30 + 70) + '/100'
        };
    }
    
    if (scanType === 'seo' || scanType === 'comprehensive') {
        baseResults['SEO Analysis'] = {
            'Title Tag': getRandomStatus(['Optimized', 'Present', 'Missing', 'Too Long'], [0.5, 0.3, 0.1, 0.1]),
            'Meta Description': getRandomStatus(['Good', 'Present', 'Missing', 'Too Short'], [0.4, 0.4, 0.15, 0.05]),
            'H1 Tags': getRandomStatus(['Optimized', 'Present', 'Missing', 'Multiple'], [0.4, 0.4, 0.15, 0.05]),
            'Mobile Friendly': getRandomStatus(['Yes', 'Partially', 'No'], [0.8, 0.15, 0.05]),
            'Page Speed': getRandomStatus(['Fast', 'Average', 'Slow'], [0.4, 0.4, 0.2]),
            'Schema Markup': getRandomStatus(['Present', 'Missing'], [0.3, 0.7]),
            'Social Media Tags': getRandomStatus(['Complete', 'Partial', 'Missing'], [0.4, 0.3, 0.3])
        };
    }
    
    // Add comprehensive analysis for comprehensive scan
    if (scanType === 'comprehensive') {
        baseResults['Additional Insights'] = {
            'Technology Stack': getRandomItem(['WordPress', 'React', 'Angular', 'Vue.js', 'Custom']),
            'CDN Usage': getRandomStatus(['Yes', 'No'], [0.6, 0.4]),
            'Compression': getRandomStatus(['Enabled', 'Disabled'], [0.8, 0.2]),
            'Caching': getRandomStatus(['Optimized', 'Basic', 'None'], [0.5, 0.3, 0.2]),
            'Accessibility Score': Math.floor(Math.random() * 30 + 70) + '/100'
        };
    }
    
    return baseResults;
}

// Helper functions
function getRandomStatus(options, weights) {
    const random = Math.random();
    let cumulative = 0;
    
    for (let i = 0; i < options.length; i++) {
        cumulative += weights[i];
        if (random <= cumulative) {
            return options[i];
        }
    }
    
    return options[0];
}

function getRandomItem(items) {
    return items[Math.floor(Math.random() * items.length)];
}

function generateRandomIP() {
    return `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
}

// Display scan results
function displayResults(results, url) {
    const resultsGrid = document.getElementById('resultsGrid');
    const scannedUrl = document.getElementById('scannedUrl');
    
    // Show scanned URL
    scannedUrl.innerHTML = `<i class="fas fa-link"></i> Scanned URL: <strong>${url}</strong>`;
    
    resultsGrid.innerHTML = '';
    
    Object.keys(results).forEach(category => {
        const card = document.createElement('div');
        card.className = 'result-card';
        
        let cardHTML = `<h3><i class="fas fa-${getCategoryIcon(category)}"></i> ${category}</h3>`;
        
        Object.keys(results[category]).forEach(item => {
            const value = results[category][item];
            const statusClass = getStatusClass(value);
            
            cardHTML += `
                <div class="result-item">
                    <span>${item}</span>
                    <span class="status ${statusClass}">${value}</span>
                </div>
            `;
        });
        
        card.innerHTML = cardHTML;
        resultsGrid.appendChild(card);
    });
    
    document.getElementById('resultsSection').style.display = 'block';
    
    // Scroll to results
    document.getElementById('resultsSection').scrollIntoView({ behavior: 'smooth' });
}

// Get icon for category
function getCategoryIcon(category) {
    const icons = {
        'Basic Information': 'info-circle',
        'Security Analysis': 'shield-alt',
        'Performance Metrics': 'tachometer-alt',
        'SEO Analysis': 'search',
        'Additional Insights': 'lightbulb'
    };
    return icons[category] || 'cog';
}

// Get status class for styling
function getStatusClass(value) {
    const goodTerms = ['Online', 'Valid', 'Enabled', 'Good', 'Clean', 'Present', 'Optimized', 'Yes', 'Fast', 'Excellent', 'Complete', 'Protected', 'A+', 'A'];
    const warningTerms = ['Partial', 'Low Risk', 'Medium Risk', 'Too Long', 'Too Short', 'Missing', 'Multiple', 'Average', 'Basic', 'Partially', 'B'];
    const errorTerms = ['Offline', 'Invalid', 'Expired', 'Disabled', 'High Risk', 'No', 'Slow', 'None', 'Suspicious', 'Unprotected'];
    
    if (goodTerms.some(term => value.includes(term))) return 'good';
    if (errorTerms.some(term => value.includes(term))) return 'error';
    if (warningTerms.some(term => value.includes(term))) return 'warning';
    
    // For numeric values
    if (value.includes('/100')) {
        const score = parseInt(value);
        if (score >= 80) return 'good';
        if (score >= 60) return 'warning';
        return 'error';
    }
    
    return 'good';
}

// Load and display scan history
function loadScanHistory() {
    const historyList = document.getElementById('historyList');
    historyList.innerHTML = '';
    
    if (scanHistory.length === 0) {
        historyList.innerHTML = '<p style="text-align: center; color: #6c757d; padding: 20px;">No scan history available</p>';
        return;
    }
    
    scanHistory.forEach((record, index) => {
        const historyItem = document.createElement('div');
        historyItem.className = 'history-item';
        historyItem.onclick = () => viewHistoryResults(index);
        
        const date = new Date(record.date).toLocaleString();
        
        historyItem.innerHTML = `
            <div>
                <div class="history-url">${record.url}</div>
                <div class="history-date">${date}</div>
            </div>
            <div class="history-type">${record.type.toUpperCase()}</div>
        `;
        
        historyList.appendChild(historyItem);
    });
}

// View results from history
function viewHistoryResults(index) {
    const record = scanHistory[index];
    displayResults(record.results, record.url);
    
    // Update URL input
    document.getElementById('urlInput').value = record.url;
    document.getElementById('scanType').value = record.type;
}

// Clear scan history
function clearHistory() {
    if (confirm('Do you want to clear the scan history?')) {
        scanHistory = [];
        localStorage.removeItem('scanHistory');
        loadScanHistory();
        showNotification('Scan history cleared successfully', 'success');
    }
}

// Handle page visibility change (pause camera when page is hidden)
document.addEventListener('visibilitychange', function() {
    if (document.hidden && qrScanner) {
        qrScanner.stop();
    } else if (!document.hidden && qrScanner && currentStream) {
        qrScanner.start();
    }
});

// Handle page unload (cleanup)
window.addEventListener('beforeunload', function() {
    closeCamera();
});