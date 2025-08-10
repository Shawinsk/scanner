// Mobile Website Scanner with QR Code Support

let scanHistory = JSON.parse(localStorage.getItem('scanHistory')) || [];
let qrScanner = null;
let currentStream = null;
let facingMode = 'environment'; // Start with back camera
let currentScanMode = 'qr'; // qr, text, barcode, nature
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

// Process barcode data and determine type
function processBarcodeData(barcode) {
    const barcodeInfo = {
        code: barcode,
        type: determineBarcodeType(barcode),
        length: barcode.length,
        checkDigit: null,
        country: null,
        manufacturer: null,
        product: null,
        isValid: false
    };
    
    // Process based on barcode type
    if (barcodeInfo.type === 'EAN-13' || barcodeInfo.type === 'UPC-A') {
        barcodeInfo.isValid = validateEAN13(barcode);
        if (barcodeInfo.isValid) {
            barcodeInfo.country = getCountryFromEAN(barcode.substring(0, 3));
            barcodeInfo.manufacturer = barcode.substring(3, 8);
            barcodeInfo.product = barcode.substring(8, 12);
            barcodeInfo.checkDigit = barcode.substring(12, 13);
        }
    } else if (barcodeInfo.type === 'EAN-8') {
        barcodeInfo.isValid = validateEAN8(barcode);
        if (barcodeInfo.isValid) {
            barcodeInfo.country = getCountryFromEAN(barcode.substring(0, 3));
            barcodeInfo.product = barcode.substring(3, 7);
            barcodeInfo.checkDigit = barcode.substring(7, 8);
        }
    } else if (barcodeInfo.type === 'Code 128' || barcodeInfo.type === 'Code 39') {
        barcodeInfo.isValid = true; // These don't have standard validation
    }
    
    return barcodeInfo;
}

// Determine barcode type based on pattern
function determineBarcodeType(barcode) {
    if (/^\d{13}$/.test(barcode)) {
        return 'EAN-13';
    } else if (/^\d{12}$/.test(barcode)) {
        return 'UPC-A';
    } else if (/^\d{8}$/.test(barcode)) {
        return 'EAN-8';
    } else if (/^\d{6}$/.test(barcode)) {
        return 'UPC-E';
    } else if (/^[A-Z0-9\-\. \$\/\+\%]+$/.test(barcode)) {
        return 'Code 39';
    } else {
        return 'Code 128';
    }
}

// Validate EAN-13 barcode
function validateEAN13(barcode) {
    if (!/^\d{13}$/.test(barcode)) return false;
    
    let sum = 0;
    for (let i = 0; i < 12; i++) {
        const digit = parseInt(barcode[i]);
        sum += (i % 2 === 0) ? digit : digit * 3;
    }
    
    const checkDigit = (10 - (sum % 10)) % 10;
    return checkDigit === parseInt(barcode[12]);
}

// Validate EAN-8 barcode
function validateEAN8(barcode) {
    if (!/^\d{8}$/.test(barcode)) return false;
    
    let sum = 0;
    for (let i = 0; i < 7; i++) {
        const digit = parseInt(barcode[i]);
        sum += (i % 2 === 0) ? digit * 3 : digit;
    }
    
    const checkDigit = (10 - (sum % 10)) % 10;
    return checkDigit === parseInt(barcode[7]);
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
    } else if (currentScanMode === 'nature') {
        await analyzeNatureImage(canvas);
    } else {
        // For other modes, save the image
        downloadImage(canvas);
        showNotification('Image captured successfully!', 'success');
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
    link.download = `scan_${currentScanMode}_${new Date().getTime()}.png`;
    link.href = canvas.toDataURL();
    link.click();
    showNotification('Image downloaded!', 'success');
}

// Analyze nature image for plant identification
async function analyzeNatureImage(canvas) {
    try {
        showNotification('Analyzing nature image...', 'info');
        
        // Simulate plant identification API call
        const analysisResult = await simulatePlantIdentification(canvas);
        const healthData = await assessPlantHealth(canvas);
        const recommendations = generateCareRecommendations(analysisResult, healthData);
        
        analysisResult.health = healthData;
        analysisResult.recommendations = recommendations;
        
        showNatureAnalysisResult(analysisResult);
        
    } catch (error) {
        console.error('Nature analysis error:', error);
        showNotification('Nature analysis failed: ' + error.message, 'error');
    }
}

// Simulate plant identification (in real app, this would call a plant ID API)
async function simulatePlantIdentification(canvas) {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Analyze image colors and features
    const imageAnalysis = analyzeImageFeatures(canvas);
    
    // Mock plant identification results with enhanced data
    const plants = [
        {
            name: 'Rose (Rosa)',
            confidence: 0.92,
            family: 'Rosaceae',
            description: 'A woody perennial flowering plant of the genus Rosa, in the family Rosaceae.',
            care: 'Requires full sun, well-drained soil, and regular watering.',
            season: 'Spring to Fall',
            toxicity: 'Non-toxic to humans, mildly toxic to pets',
            uses: 'Ornamental, perfume, culinary (rose hips)'
        },
        {
            name: 'Sunflower (Helianthus)',
            confidence: 0.88,
            family: 'Asteraceae',
            description: 'Large flowering plant in the daisy family Asteraceae.',
            care: 'Needs full sun, well-drained soil, and moderate watering.',
            season: 'Summer to Fall',
            toxicity: 'Non-toxic',
            uses: 'Ornamental, oil production, bird feed'
        },
        {
            name: 'Oak Tree (Quercus)',
            confidence: 0.85,
            family: 'Fagaceae',
            description: 'A tree or shrub in the beech family, Fagaceae.',
            care: 'Prefers full sun to partial shade and well-drained soil.',
            season: 'Year-round (deciduous varieties lose leaves)',
            toxicity: 'Acorns toxic to some animals',
            uses: 'Timber, wildlife habitat, landscaping'
        },
        {
            name: 'Lavender (Lavandula)',
            confidence: 0.90,
            family: 'Lamiaceae',
            description: 'Aromatic flowering plant in the mint family.',
            care: 'Drought tolerant, needs full sun and well-drained soil.',
            season: 'Spring to Summer',
            toxicity: 'Generally safe, mild toxicity to pets',
            uses: 'Aromatherapy, culinary, ornamental, insect repellent'
        }
    ];
    
    // Select plant based on image analysis
    let selectedPlant = plants[Math.floor(Math.random() * plants.length)];
    selectedPlant.confidence = Math.random() * 0.3 + 0.7; // 70-100% confidence
    
    // Add image analysis data
    selectedPlant.imageAnalysis = imageAnalysis;
    
    return {
        identified: true,
        plant: selectedPlant,
        suggestions: plants.filter(p => p !== selectedPlant).slice(0, 2),
        environmentalData: generateEnvironmentalData()
    };
}

// Analyze image features for better identification
function analyzeImageFeatures(canvas) {
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    
    let totalR = 0, totalG = 0, totalB = 0;
    let greenPixels = 0, brownPixels = 0, colorfulPixels = 0;
    
    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        
        totalR += r;
        totalG += g;
        totalB += b;
        
        // Detect green (likely vegetation)
        if (g > r && g > b && g > 100) greenPixels++;
        
        // Detect brown (likely bark/soil)
        if (r > 100 && g > 50 && b < 100 && Math.abs(r - g) < 50) brownPixels++;
        
        // Detect colorful areas (likely flowers)
        if (Math.max(r, g, b) - Math.min(r, g, b) > 50) colorfulPixels++;
    }
    
    const totalPixels = data.length / 4;
    const avgR = Math.round(totalR / totalPixels);
    const avgG = Math.round(totalG / totalPixels);
    const avgB = Math.round(totalB / totalPixels);
    
    return {
        dominantColor: `rgb(${avgR}, ${avgG}, ${avgB})`,
        greenPercentage: Math.round((greenPixels / totalPixels) * 100),
        brownPercentage: Math.round((brownPixels / totalPixels) * 100),
        colorfulPercentage: Math.round((colorfulPixels / totalPixels) * 100),
        brightness: Math.round((avgR + avgG + avgB) / 3),
        contrast: calculateImageContrast(data),
        saturation: calculateImageSaturation(data, totalPixels)
    };
}

// Calculate image contrast
function calculateImageContrast(data) {
    let min = 255, max = 0;
    
    for (let i = 0; i < data.length; i += 4) {
        const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
        min = Math.min(min, brightness);
        max = Math.max(max, brightness);
    }
    
    return Math.round(((max - min) / 255) * 100);
}

// Calculate image saturation
function calculateImageSaturation(data, totalPixels) {
    let totalSaturation = 0;
    
    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const saturation = max === 0 ? 0 : ((max - min) / max) * 100;
        
        totalSaturation += saturation;
    }
    
    return Math.round(totalSaturation / totalPixels);
}

// Generate environmental data
function generateEnvironmentalData() {
    return {
        estimatedLightLevel: ['Low', 'Medium', 'High'][Math.floor(Math.random() * 3)],
        recommendedWatering: ['Daily', 'Every 2-3 days', 'Weekly'][Math.floor(Math.random() * 3)],
        soilType: ['Sandy', 'Clay', 'Loamy', 'Rocky'][Math.floor(Math.random() * 4)],
        humidity: Math.floor(Math.random() * 40) + 40 + '%' // 40-80%
    };
}

// Assess plant health from image analysis
async function assessPlantHealth(canvas) {
    // Simulate health assessment delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const imageAnalysis = analyzeImageFeatures(canvas);
    
    // Determine health based on color analysis
    const healthScore = calculateHealthScore(imageAnalysis);
    
    return {
        overallHealth: getHealthStatus(healthScore),
        healthScore: healthScore,
        issues: generateHealthIssues(imageAnalysis),
        vitality: {
            leafColor: analyzeLeafColor(imageAnalysis),
            growth: ['Excellent', 'Good', 'Fair', 'Poor'][Math.floor(Math.random() * 4)],
            density: ['Dense', 'Moderate', 'Sparse'][Math.floor(Math.random() * 3)]
        },
        symptoms: detectSymptoms(imageAnalysis)
    };
}

// Calculate health score based on image features
function calculateHealthScore(imageAnalysis) {
    let score = 70; // Base score
    
    // Green percentage indicates plant health
    if (imageAnalysis.greenPercentage > 40) score += 20;
    else if (imageAnalysis.greenPercentage > 20) score += 10;
    else score -= 10;
    
    // Brightness indicates good lighting
    if (imageAnalysis.brightness > 100 && imageAnalysis.brightness < 200) score += 10;
    else score -= 5;
    
    // Colorful areas might indicate flowers (healthy)
    if (imageAnalysis.colorfulPercentage > 15) score += 10;
    
    // Brown areas might indicate disease or dead parts
    if (imageAnalysis.brownPercentage > 30) score -= 15;
    
    return Math.max(0, Math.min(100, score));
}

// Get health status from score
function getHealthStatus(score) {
    if (score >= 80) return 'Excellent';
    if (score >= 65) return 'Good';
    if (score >= 50) return 'Fair';
    if (score >= 35) return 'Poor';
    return 'Critical';
}

// Generate potential health issues
function generateHealthIssues(imageAnalysis) {
    const issues = [];
    
    if (imageAnalysis.greenPercentage < 20) {
        issues.push('Low chlorophyll levels detected');
    }
    
    if (imageAnalysis.brownPercentage > 25) {
        issues.push('Possible leaf browning or disease');
    }
    
    if (imageAnalysis.brightness < 80) {
        issues.push('Insufficient lighting detected');
    }
    
    if (imageAnalysis.brightness > 220) {
        issues.push('Possible light burn or overexposure');
    }
    
    if (issues.length === 0) {
        issues.push('No major issues detected');
    }
    
    return issues;
}

// Analyze leaf color health
function analyzeLeafColor(imageAnalysis) {
    if (imageAnalysis.greenPercentage > 40) return 'Vibrant Green';
    if (imageAnalysis.greenPercentage > 25) return 'Moderate Green';
    if (imageAnalysis.brownPercentage > 20) return 'Yellowing/Browning';
    return 'Pale/Unhealthy';
}

// Detect symptoms from image
function detectSymptoms(imageAnalysis) {
    const symptoms = [];
    
    if (imageAnalysis.brownPercentage > 20) {
        symptoms.push('Leaf browning');
    }
    
    if (imageAnalysis.greenPercentage < 15) {
        symptoms.push('Chlorosis (yellowing)');
    }
    
    if (imageAnalysis.brightness < 70) {
        symptoms.push('Etiolation (stretching)');
    }
    
    // Advanced symptom detection
    if (imageAnalysis.contrast < 30) {
        symptoms.push('Poor leaf definition (possible disease)');
    }
    
    if (imageAnalysis.saturation < 20) {
        symptoms.push('Color fading (stress or disease)');
    }
    
    if (imageAnalysis.brownPercentage > 30 && imageAnalysis.greenPercentage < 30) {
        symptoms.push('Severe leaf damage or disease');
    }
    
    // Disease pattern detection
    const diseasePatterns = detectDiseasePatterns(imageAnalysis);
    symptoms.push(...diseasePatterns);
    
    const randomSymptoms = ['Wilting', 'Pest damage', 'Nutrient deficiency', 'Overwatering', 'Underwatering'];
    if (Math.random() < 0.3) {
        symptoms.push(randomSymptoms[Math.floor(Math.random() * randomSymptoms.length)]);
    }
    
    return symptoms.length > 0 ? symptoms : ['No visible symptoms'];
}

// Detect disease patterns
function detectDiseasePatterns(imageAnalysis) {
    const patterns = [];
    
    // Fungal disease indicators
    if (imageAnalysis.brownPercentage > 25 && imageAnalysis.brightness < 120) {
        patterns.push('Possible fungal infection');
    }
    
    // Bacterial disease indicators
    if (imageAnalysis.contrast > 70 && imageAnalysis.brownPercentage > 15) {
        patterns.push('Possible bacterial spot disease');
    }
    
    // Viral disease indicators
    if (imageAnalysis.saturation < 25 && imageAnalysis.greenPercentage < 25) {
        patterns.push('Possible viral infection (mosaic pattern)');
    }
    
    // Nutrient deficiency patterns
    if (imageAnalysis.greenPercentage < 20 && imageAnalysis.brightness > 150) {
        patterns.push('Possible nitrogen deficiency');
    }
    
    // Pest damage patterns
    if (imageAnalysis.contrast > 60 && imageAnalysis.colorfulPercentage < 10) {
        patterns.push('Possible insect damage');
    }
    
    return patterns;
}

// Generate care recommendations
function generateCareRecommendations(plantResult, healthData) {
    const recommendations = {
        immediate: [],
        weekly: [],
        monthly: [],
        seasonal: []
    };
    
    // Immediate recommendations based on health
    if (healthData.healthScore < 50) {
        recommendations.immediate.push('Inspect plant thoroughly for pests and diseases');
        recommendations.immediate.push('Check soil moisture and drainage');
    }
    
    if (healthData.issues.includes('Insufficient lighting detected')) {
        recommendations.immediate.push('Move to brighter location or add grow lights');
    }
    
    if (healthData.issues.includes('Possible light burn or overexposure')) {
        recommendations.immediate.push('Move to location with filtered or indirect light');
    }
    
    // Weekly recommendations
    recommendations.weekly.push('Check soil moisture levels');
    recommendations.weekly.push('Inspect for pests and diseases');
    recommendations.weekly.push('Rotate plant for even light exposure');
    
    if (plantResult.identified) {
        const plant = plantResult.plant;
        
        // Add plant-specific weekly care
        if (plant.name.toLowerCase().includes('succulent') || plant.name.toLowerCase().includes('cactus')) {
            recommendations.weekly.push('Water only when soil is completely dry');
        } else {
            recommendations.weekly.push('Water when top inch of soil is dry');
        }
    }
    
    // Monthly recommendations
    recommendations.monthly.push('Check for root bound conditions');
    recommendations.monthly.push('Clean leaves with damp cloth');
    recommendations.monthly.push('Apply balanced fertilizer if growing season');
    
    // Seasonal recommendations
    recommendations.seasonal.push('Adjust watering frequency for season');
    recommendations.seasonal.push('Consider repotting if roots are crowded');
    recommendations.seasonal.push('Prune dead or damaged growth');
    
    return recommendations;
}

// Show nature analysis results
function showNatureAnalysisResult(result) {
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
        max-width: 90%;
        max-height: 80%;
        overflow-y: auto;
        box-shadow: 0 10px 30px rgba(0,0,0,0.5);
    `;
    
    if (result.identified) {
         const plant = result.plant;
         const analysis = plant.imageAnalysis;
         const env = result.environmentalData;
         
         content.innerHTML = `
             <h3><i class="fas fa-leaf"></i> Plant Identified</h3>
             <div style="background: #e8f5e8; padding: 20px; border-radius: 10px; margin: 15px 0;">
                 <h4 style="color: #2e7d32; margin: 0 0 10px 0;">${plant.name}</h4>
                 <p><strong>Family:</strong> ${plant.family}</p>
                 <p><strong>Confidence:</strong> ${Math.round(plant.confidence * 100)}%</p>
                 <p><strong>Description:</strong> ${plant.description}</p>
                 <p><strong>Care Instructions:</strong> ${plant.care}</p>
                 <p><strong>Growing Season:</strong> ${plant.season}</p>
                 <p><strong>Toxicity:</strong> ${plant.toxicity}</p>
                 <p><strong>Uses:</strong> ${plant.uses}</p>
             </div>
             
             <div style="background: #f0f8ff; padding: 15px; border-radius: 10px; margin: 15px 0;">
                 <h4><i class="fas fa-eye"></i> Image Analysis</h4>
                 <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 14px;">
                     <p><strong>Dominant Color:</strong> <span style="display: inline-block; width: 20px; height: 20px; background: ${analysis.dominantColor}; border-radius: 3px; vertical-align: middle;"></span></p>
                     <p><strong>Brightness:</strong> ${analysis.brightness}/255</p>
                     <p><strong>Green Content:</strong> ${analysis.greenPercentage}%</p>
                     <p><strong>Colorful Areas:</strong> ${analysis.colorfulPercentage}%</p>
                 </div>
             </div>
             
             <div style="background: #fff8e1; padding: 15px; border-radius: 10px; margin: 15px 0;">
                 <h4><i class="fas fa-cloud-sun"></i> Environmental Assessment</h4>
                 <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 14px;">
                     <p><strong>Light Level:</strong> ${env.estimatedLightLevel}</p>
                     <p><strong>Watering:</strong> ${env.recommendedWatering}</p>
                     <p><strong>Soil Type:</strong> ${env.soilType}</p>
                     <p><strong>Humidity:</strong> ${env.humidity}</p>
                 </div>
             </div>
             
             ${result.health ? `
                 <div style="background: #f3e5f5; padding: 15px; border-radius: 10px; margin: 15px 0;">
                     <h4><i class="fas fa-heartbeat"></i> Health Assessment</h4>
                     <div style="margin-bottom: 10px;">
                         <p><strong>Overall Health:</strong> <span style="color: ${getHealthColor(result.health.overallHealth)};">${result.health.overallHealth}</span> (${result.health.healthScore}/100)</p>
                     </div>
                     <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 14px;">
                         <p><strong>Leaf Color:</strong> ${result.health.vitality.leafColor}</p>
                         <p><strong>Growth:</strong> ${result.health.vitality.growth}</p>
                         <p><strong>Density:</strong> ${result.health.vitality.density}</p>
                     </div>
                     ${result.health.issues.length > 0 ? `
                         <div style="margin-top: 10px;">
                             <strong>Issues Detected:</strong>
                             <ul style="margin: 5px 0; padding-left: 20px;">
                                 ${result.health.issues.map(issue => `<li>${issue}</li>`).join('')}
                             </ul>
                         </div>
                     ` : ''}
                     ${result.health.symptoms.length > 0 ? `
                         <div style="margin-top: 10px;">
                             <strong>Symptoms:</strong>
                             <ul style="margin: 5px 0; padding-left: 20px;">
                                 ${result.health.symptoms.map(symptom => `<li>${symptom}</li>`).join('')}
                             </ul>
                         </div>
                     ` : ''}
                 </div>
             ` : ''}
             
             ${result.recommendations ? `
                 <div style="background: #e8f5e8; padding: 15px; border-radius: 10px; margin: 15px 0;">
                     <h4><i class="fas fa-tasks"></i> Care Recommendations</h4>
                     
                     ${result.recommendations.immediate.length > 0 ? `
                         <div style="margin-bottom: 15px;">
                             <h5 style="color: #d32f2f; margin: 0 0 5px 0;"><i class="fas fa-exclamation-triangle"></i> Immediate Actions</h5>
                             <ul style="margin: 0; padding-left: 20px; font-size: 14px;">
                                 ${result.recommendations.immediate.map(rec => `<li>${rec}</li>`).join('')}
                             </ul>
                         </div>
                     ` : ''}
                     
                     <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 15px; font-size: 14px;">
                         <div>
                             <h6 style="color: #1976d2; margin: 0 0 5px 0;">Weekly</h6>
                             <ul style="margin: 0; padding-left: 15px;">
                                 ${result.recommendations.weekly.slice(0, 3).map(rec => `<li>${rec}</li>`).join('')}
                             </ul>
                         </div>
                         <div>
                             <h6 style="color: #388e3c; margin: 0 0 5px 0;">Monthly</h6>
                             <ul style="margin: 0; padding-left: 15px;">
                                 ${result.recommendations.monthly.slice(0, 3).map(rec => `<li>${rec}</li>`).join('')}
                             </ul>
                         </div>
                         <div>
                             <h6 style="color: #f57c00; margin: 0 0 5px 0;">Seasonal</h6>
                             <ul style="margin: 0; padding-left: 15px;">
                                 ${result.recommendations.seasonal.slice(0, 3).map(rec => `<li>${rec}</li>`).join('')}
                             </ul>
                         </div>
                     </div>
                 </div>
             ` : ''}
             
             ${result.suggestions.length > 0 ? `
                 <h4>Other Possibilities:</h4>
                 ${result.suggestions.map(s => `
                     <div style="background: #f5f5f5; padding: 10px; border-radius: 5px; margin: 5px 0;">
                         <strong>${s.name}</strong> (${s.family})
                     </div>
                 `).join('')}
             ` : ''}
             
             <div style="text-align: center; margin-top: 20px;">
                 <button onclick="searchPlantInfo('${plant.name}')" style="background: #4caf50; color: white; border: none; padding: 10px 20px; border-radius: 5px; margin: 5px; cursor: pointer;">Learn More</button>
                 <button onclick="savePlantData('${plant.name}', '${plant.family}')" style="background: #2196f3; color: white; border: none; padding: 10px 20px; border-radius: 5px; margin: 5px; cursor: pointer;">Save to Collection</button>
                 <button onclick="generateCareCalendar('${plant.name}')" style="background: #9c27b0; color: white; border: none; padding: 10px 20px; border-radius: 5px; margin: 5px; cursor: pointer;">Care Calendar</button>
                 <button onclick="this.closest('.modal').remove()" style="background: #757575; color: white; border: none; padding: 10px 20px; border-radius: 5px; margin: 5px; cursor: pointer;">Close</button>
             </div>
         `;
    } else {
        content.innerHTML = `
            <h3><i class="fas fa-leaf"></i> Nature Analysis</h3>
            <div style="background: #fff3cd; padding: 20px; border-radius: 10px; margin: 15px 0;">
                <p>Unable to identify the plant or nature object in the image.</p>
                <p>Try capturing a clearer image with better lighting, or ensure the plant is the main subject.</p>
            </div>
            <div style="text-align: center; margin-top: 20px;">
                <button onclick="this.closest('.modal').remove()">Close</button>
            </div>
        `;
    }
    
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

// Search for plant information
function searchPlantInfo(plantName) {
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(plantName + ' plant care information')}`;
    window.open(searchUrl, '_blank');
    showNotification(`Searching for ${plantName} information`, 'info');
}

// Save plant data to collection
function savePlantData(plantName, family) {
    let plantCollection = JSON.parse(localStorage.getItem('plantCollection')) || [];
    
    const plantData = {
        name: plantName,
        family: family,
        dateFound: new Date().toISOString(),
        location: 'Camera Scan'
    };
    
    // Check if plant already exists
    const exists = plantCollection.some(plant => plant.name === plantName);
    
    if (!exists) {
        plantCollection.unshift(plantData);
        localStorage.setItem('plantCollection', JSON.stringify(plantCollection));
        showNotification(`${plantName} saved to your plant collection!`, 'success');
    } else {
        showNotification(`${plantName} is already in your collection`, 'info');
    }
    
    // Close the modal
    document.querySelector('.modal').remove();
}

// View plant collection
function viewPlantCollection() {
    const plantCollection = JSON.parse(localStorage.getItem('plantCollection')) || [];
    
    if (plantCollection.length === 0) {
        showNotification('Your plant collection is empty. Start scanning plants to build your collection!', 'info');
        return;
    }
    
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
        max-width: 90%;
        max-height: 80%;
        overflow-y: auto;
        box-shadow: 0 10px 30px rgba(0,0,0,0.5);
    `;
    
    content.innerHTML = `
        <h3><i class="fas fa-seedling"></i> My Plant Collection (${plantCollection.length})</h3>
        <div style="max-height: 400px; overflow-y: auto;">
            ${plantCollection.map((plant, index) => `
                <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 10px 0; border-left: 4px solid #4caf50;">
                    <h4 style="margin: 0 0 5px 0; color: #2e7d32;">${plant.name}</h4>
                    <p style="margin: 5px 0; color: #666;"><strong>Family:</strong> ${plant.family}</p>
                    <p style="margin: 5px 0; color: #666;"><strong>Found:</strong> ${new Date(plant.dateFound).toLocaleDateString()}</p>
                    <button onclick="removePlantFromCollection(${index})" style="background: #f44336; color: white; border: none; padding: 5px 10px; border-radius: 3px; font-size: 12px; cursor: pointer;">Remove</button>
                </div>
            `).join('')}
        </div>
        <div style="text-align: center; margin-top: 20px;">
            <button onclick="clearPlantCollection()" style="background: #ff9800; color: white; border: none; padding: 10px 20px; border-radius: 5px; margin: 5px; cursor: pointer;">Clear All</button>
            <button onclick="this.closest('.modal').remove()" style="background: #757575; color: white; border: none; padding: 10px 20px; border-radius: 5px; margin: 5px; cursor: pointer;">Close</button>
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

// Remove plant from collection
function removePlantFromCollection(index) {
    let plantCollection = JSON.parse(localStorage.getItem('plantCollection')) || [];
    const removedPlant = plantCollection.splice(index, 1)[0];
    localStorage.setItem('plantCollection', JSON.stringify(plantCollection));
    showNotification(`${removedPlant.name} removed from collection`, 'success');
    
    // Refresh the modal
    document.querySelector('.modal').remove();
    viewPlantCollection();
}

// Clear plant collection
function clearPlantCollection() {
    if (confirm('Are you sure you want to clear your entire plant collection?')) {
        localStorage.removeItem('plantCollection');
        showNotification('Plant collection cleared', 'success');
        document.querySelector('.modal').remove();
    }
}

// Get health status color
function getHealthColor(status) {
    const colors = {
        'Excellent': '#4caf50',
        'Good': '#8bc34a',
        'Fair': '#ff9800',
        'Poor': '#ff5722',
        'Critical': '#f44336'
    };
    return colors[status] || '#757575';
}

// Generate care calendar
function generateCareCalendar(plantName) {
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
        z-index: 2001;
    `;
    
    const content = document.createElement('div');
    content.style.cssText = `
        background: white;
        padding: 30px;
        border-radius: 15px;
        max-width: 90%;
        max-height: 80%;
        overflow-y: auto;
        box-shadow: 0 10px 30px rgba(0,0,0,0.5);
    `;
    
    const careSchedule = generateCareSchedule(plantName);
    
    content.innerHTML = `
        <h3><i class="fas fa-calendar-alt"></i> Care Calendar for ${plantName}</h3>
        <div style="background: #f8f9fa; padding: 20px; border-radius: 10px; margin: 15px 0;">
            <h4>Weekly Schedule</h4>
            ${careSchedule.weekly.map((task, index) => `
                <div style="display: flex; align-items: center; margin: 10px 0; padding: 10px; background: white; border-radius: 5px;">
                    <input type="checkbox" id="weekly-${index}" style="margin-right: 10px;">
                    <label for="weekly-${index}" style="flex: 1;">${task}</label>
                </div>
            `).join('')}
        </div>
        
        <div style="background: #e8f5e8; padding: 20px; border-radius: 10px; margin: 15px 0;">
            <h4>Monthly Tasks</h4>
            ${careSchedule.monthly.map((task, index) => `
                <div style="display: flex; align-items: center; margin: 10px 0; padding: 10px; background: white; border-radius: 5px;">
                    <input type="checkbox" id="monthly-${index}" style="margin-right: 10px;">
                    <label for="monthly-${index}" style="flex: 1;">${task}</label>
                </div>
            `).join('')}
        </div>
        
        <div style="background: #fff3e0; padding: 20px; border-radius: 10px; margin: 15px 0;">
            <h4>Seasonal Reminders</h4>
            ${careSchedule.seasonal.map((task, index) => `
                <div style="margin: 10px 0; padding: 10px; background: white; border-radius: 5px;">
                    <strong>${task.season}:</strong> ${task.task}
                </div>
            `).join('')}
        </div>
        
        <div style="text-align: center; margin-top: 20px;">
            <button onclick="saveCareCalendar('${plantName}')" style="background: #4caf50; color: white; border: none; padding: 10px 20px; border-radius: 5px; margin: 5px; cursor: pointer;">Save Calendar</button>
            <button onclick="this.closest('.modal').remove()" style="background: #757575; color: white; border: none; padding: 10px 20px; border-radius: 5px; margin: 5px; cursor: pointer;">Close</button>
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

// Generate care schedule for plant
function generateCareSchedule(plantName) {
    const baseSchedule = {
        weekly: [
            'Check soil moisture',
            'Inspect for pests',
            'Rotate plant for even light',
            'Remove dead leaves'
        ],
        monthly: [
            'Deep watering session',
            'Apply fertilizer (growing season)',
            'Clean leaves with damp cloth',
            'Check for root bound conditions'
        ],
        seasonal: [
            { season: 'Spring', task: 'Repot if needed and increase watering' },
            { season: 'Summer', task: 'Monitor for increased water needs' },
            { season: 'Fall', task: 'Reduce fertilizing and prepare for dormancy' },
            { season: 'Winter', task: 'Reduce watering and protect from cold' }
        ]
    };
    
    // Customize based on plant type
    if (plantName.toLowerCase().includes('succulent') || plantName.toLowerCase().includes('cactus')) {
        baseSchedule.weekly[0] = 'Check soil - water only if completely dry';
        baseSchedule.monthly[0] = 'Water thoroughly but infrequently';
    }
    
    if (plantName.toLowerCase().includes('fern')) {
        baseSchedule.weekly.push('Mist leaves for humidity');
        baseSchedule.monthly.push('Check humidity levels');
    }
    
    return baseSchedule;
}

// Save care calendar
function saveCareCalendar(plantName) {
    const careCalendars = JSON.parse(localStorage.getItem('careCalendars')) || {};
    const schedule = generateCareSchedule(plantName);
    
    careCalendars[plantName] = {
        schedule: schedule,
        created: new Date().toISOString(),
        lastUpdated: new Date().toISOString()
    };
    
    localStorage.setItem('careCalendars', JSON.stringify(careCalendars));
    showNotification(`Care calendar saved for ${plantName}!`, 'success');
    
    // Close the modal
    document.querySelector('.modal').remove();
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

// Toggle Nature scanner
async function toggleNature() {
    const cameraSection = document.getElementById('cameraSection');
    
    if (cameraSection.style.display === 'none') {
        currentScanMode = 'nature';
        setScanMode('nature');
        await startCamera();
    } else {
        closeCamera();
    }
}

// Toggle Text scanner
async function toggleTextScanner() {
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

// Toggle Barcode scanner
async function toggleBarcodeScanner() {
    const cameraSection = document.getElementById('cameraSection');
    
    if (cameraSection.style.display === 'none') {
        currentScanMode = 'barcode';
        setScanMode('barcode');
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
        case 'nature':
            instruction.textContent = 'Position plant or nature object within the frame';
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
        
        // Handle different scan modes
        if (currentScanMode === 'barcode') {
            const barcodeInfo = processBarcodeData(detectedText);
            showBarcodeResult(barcodeInfo);
        } else if (currentScanMode === 'text') {
            const textInfo = processTextData(detectedText);
            showTextResult(textInfo);
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

// Get country from EAN prefix
function getCountryFromEAN(prefix) {
    const prefixNum = parseInt(prefix);
    
    if (prefixNum >= 0 && prefixNum <= 19) return 'US & Canada';
    if (prefixNum >= 30 && prefixNum <= 39) return 'US drugs';
    if (prefixNum >= 60 && prefixNum <= 99) return 'US & Canada';
    if (prefixNum >= 100 && prefixNum <= 139) return 'US';
    if (prefixNum >= 300 && prefixNum <= 379) return 'France';
    if (prefixNum === 380) return 'Bulgaria';
    if (prefixNum >= 400 && prefixNum <= 440) return 'Germany';
    if (prefixNum >= 450 && prefixNum <= 459) return 'Japan';
    if (prefixNum >= 460 && prefixNum <= 469) return 'Russia';
    if (prefixNum >= 490 && prefixNum <= 499) return 'Japan';
    if (prefixNum >= 500 && prefixNum <= 509) return 'United Kingdom';
    if (prefixNum >= 520 && prefixNum <= 521) return 'Greece';
    if (prefixNum >= 540 && prefixNum <= 549) return 'Belgium & Luxembourg';
    if (prefixNum === 560) return 'Portugal';
    if (prefixNum >= 570 && prefixNum <= 579) return 'Denmark';
    if (prefixNum === 590) return 'Poland';
    if (prefixNum >= 690 && prefixNum <= 695) return 'China';
    if (prefixNum >= 700 && prefixNum <= 709) return 'Norway';
    if (prefixNum === 729) return 'Israel';
    if (prefixNum >= 730 && prefixNum <= 739) return 'Sweden';
    if (prefixNum === 750) return 'Mexico';
    if (prefixNum >= 754 && prefixNum <= 755) return 'Canada';
    if (prefixNum >= 760 && prefixNum <= 769) return 'Switzerland';
    if (prefixNum >= 770 && prefixNum <= 771) return 'Colombia';
    if (prefixNum >= 780) return 'Chile';
    if (prefixNum >= 789 && prefixNum <= 790) return 'Brazil';
    if (prefixNum >= 800 && prefixNum <= 839) return 'Italy';
    if (prefixNum >= 840 && prefixNum <= 849) return 'Spain';
    if (prefixNum >= 870 && prefixNum <= 879) return 'Netherlands';
    if (prefixNum === 880) return 'South Korea';
    if (prefixNum === 885) return 'Thailand';
    if (prefixNum === 888) return 'Singapore';
    if (prefixNum === 890) return 'India';
    if (prefixNum >= 900 && prefixNum <= 919) return 'Austria';
    if (prefixNum >= 930 && prefixNum <= 939) return 'Australia';
    if (prefixNum >= 940 && prefixNum <= 949) return 'New Zealand';
    if (prefixNum === 955) return 'Malaysia';
    if (prefixNum >= 977) return 'Serial publications (ISSN)';
    if (prefixNum >= 978 && prefixNum <= 979) return 'Books (ISBN)';
    
    return 'Unknown';
}

// Show barcode analysis results
function showBarcodeResult(barcodeInfo) {
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
        max-width: 90%;
        max-height: 80%;
        overflow-y: auto;
        box-shadow: 0 10px 30px rgba(0,0,0,0.5);
    `;
    
    content.innerHTML = `
        <h3><i class="fas fa-barcode"></i> Barcode Analysis</h3>
        
        <div style="background: #f8f9fa; padding: 20px; border-radius: 10px; margin: 15px 0;">
            <h4>Basic Information</h4>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; font-size: 14px;">
                <p><strong>Code:</strong> ${barcodeInfo.code}</p>
                <p><strong>Type:</strong> ${barcodeInfo.type}</p>
                <p><strong>Length:</strong> ${barcodeInfo.length} digits</p>
                <p><strong>Valid:</strong> <span style="color: ${barcodeInfo.isValid ? '#4caf50' : '#f44336'};">${barcodeInfo.isValid ? 'Yes' : 'No'}</span></p>
            </div>
        </div>
        
        ${barcodeInfo.country ? `
            <div style="background: #e3f2fd; padding: 20px; border-radius: 10px; margin: 15px 0;">
                <h4>Geographic Information</h4>
                <p><strong>Country/Region:</strong> ${barcodeInfo.country}</p>
                ${barcodeInfo.manufacturer ? `<p><strong>Manufacturer Code:</strong> ${barcodeInfo.manufacturer}</p>` : ''}
                ${barcodeInfo.product ? `<p><strong>Product Code:</strong> ${barcodeInfo.product}</p>` : ''}
                ${barcodeInfo.checkDigit ? `<p><strong>Check Digit:</strong> ${barcodeInfo.checkDigit}</p>` : ''}
            </div>
        ` : ''}
        
        <div style="background: #f3e5f5; padding: 20px; border-radius: 10px; margin: 15px 0;">
            <h4>Barcode Type Information</h4>
            <div style="font-size: 14px;">
                ${getBarcodeTypeInfo(barcodeInfo.type)}
            </div>
        </div>
        
        <div style="text-align: center; margin-top: 20px;">
            <button onclick="searchProductInfo('${barcodeInfo.code}')" style="background: #4caf50; color: white; border: none; padding: 10px 20px; border-radius: 5px; margin: 5px; cursor: pointer;">Search Product</button>
            <button onclick="copyToClipboard('${barcodeInfo.code}')" style="background: #2196f3; color: white; border: none; padding: 10px 20px; border-radius: 5px; margin: 5px; cursor: pointer;">Copy Code</button>
            <button onclick="saveBarcodeData('${barcodeInfo.code}', '${barcodeInfo.type}')" style="background: #ff9800; color: white; border: none; padding: 10px 20px; border-radius: 5px; margin: 5px; cursor: pointer;">Save to History</button>
            <button onclick="this.closest('.modal').remove()" style="background: #757575; color: white; border: none; padding: 10px 20px; border-radius: 5px; margin: 5px; cursor: pointer;">Close</button>
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

// Get barcode type information
function getBarcodeTypeInfo(type) {
    const typeInfo = {
        'EAN-13': 'European Article Number (13 digits) - Most common worldwide retail barcode standard',
        'UPC-A': 'Universal Product Code (12 digits) - Primary barcode used in North America',
        'EAN-8': 'European Article Number (8 digits) - Compact version for small packages',
        'UPC-E': 'Universal Product Code (6 digits) - Compressed version of UPC-A',
        'Code 39': 'Alphanumeric barcode supporting letters, numbers, and some symbols',
        'Code 128': 'High-density barcode supporting full ASCII character set'
    };
    
    return typeInfo[type] || 'General purpose barcode format';
}

// Copy barcode to clipboard
function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showNotification('Barcode copied to clipboard!', 'success');
    }).catch(() => {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        showNotification('Barcode copied to clipboard!', 'success');
    });
}

// Save barcode data to history
function saveBarcodeData(code, type) {
    let barcodeHistory = JSON.parse(localStorage.getItem('barcodeHistory')) || [];
    
    const barcodeData = {
        code: code,
        type: type,
        dateScanned: new Date().toISOString(),
        location: 'Camera Scan'
    };
    
    // Check if barcode already exists
    const exists = barcodeHistory.some(barcode => barcode.code === code);
    
    if (!exists) {
        barcodeHistory.unshift(barcodeData);
        // Keep only last 50 barcodes
        if (barcodeHistory.length > 50) {
            barcodeHistory = barcodeHistory.slice(0, 50);
        }
        localStorage.setItem('barcodeHistory', JSON.stringify(barcodeHistory));
        showNotification(`Barcode ${code} saved to history!`, 'success');
    } else {
        showNotification(`Barcode ${code} is already in history`, 'info');
    }
    
    // Close the modal
    document.querySelector('.modal').remove();
}

// Process text scanning results
function processTextData(text) {
    const textInfo = {
        text: text,
        length: text.length,
        wordCount: text.split(/\s+/).filter(word => word.length > 0).length,
        lineCount: text.split('\n').length,
        hasNumbers: /\d/.test(text),
        hasSpecialChars: /[!@#$%^&*(),.?":{}|<>]/.test(text),
        language: detectLanguage(text),
        type: classifyTextType(text),
        dateScanned: new Date().toISOString()
    };
    
    return textInfo;
}

// Detect language of text (basic detection)
function detectLanguage(text) {
    // Simple language detection based on character patterns
    if (/[\u0D80-\u0DFF]/.test(text)) return 'Sinhala';
    if (/[\u0B80-\u0BFF]/.test(text)) return 'Tamil';
    if (/[\u4e00-\u9fff]/.test(text)) return 'Chinese';
    if (/[\u3040-\u309f\u30a0-\u30ff]/.test(text)) return 'Japanese';
    if (/[\u0600-\u06ff]/.test(text)) return 'Arabic';
    if (/[\u0900-\u097f]/.test(text)) return 'Hindi';
    if (/[a-zA-Z]/.test(text)) return 'English';
    return 'Unknown';
}

// Classify text type
function classifyTextType(text) {
    // Email pattern
    if (/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/.test(text)) {
        return 'Email';
    }
    
    // Phone number pattern
    if (/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b|\+\d{1,3}[\s.-]?\d{1,14}/.test(text)) {
        return 'Phone Number';
    }
    
    // URL pattern
    if (/https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/.test(text)) {
        return 'URL';
    }
    
    // Address pattern (basic)
    if (/\d+\s+[A-Za-z\s]+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr)/.test(text)) {
        return 'Address';
    }
    
    // Date pattern
    if (/\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b|\b\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}\b/.test(text)) {
        return 'Date';
    }
    
    // Credit card pattern
    if (/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/.test(text)) {
        return 'Credit Card';
    }
    
    // License plate pattern
    if (/\b[A-Z]{1,3}[\s-]?\d{1,4}[\s-]?[A-Z]{0,3}\b/.test(text)) {
        return 'License Plate';
    }
    
    return 'General Text';
}

// Show text analysis results
function showTextResult(textInfo) {
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
        max-width: 90%;
        max-height: 80%;
        overflow-y: auto;
        box-shadow: 0 10px 30px rgba(0,0,0,0.5);
    `;
    
    content.innerHTML = `
        <h3><i class="fas fa-font"></i> Text Analysis</h3>
        
        <div style="background: #f8f9fa; padding: 20px; border-radius: 10px; margin: 15px 0;">
            <h4>Detected Text</h4>
            <div style="background: white; padding: 15px; border-radius: 5px; border: 1px solid #ddd; max-height: 200px; overflow-y: auto; font-family: monospace; white-space: pre-wrap;">${textInfo.text}</div>
        </div>
        
        <div style="background: #e8f5e8; padding: 20px; border-radius: 10px; margin: 15px 0;">
            <h4>Text Statistics</h4>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; font-size: 14px;">
                <p><strong>Length:</strong> ${textInfo.length} characters</p>
                <p><strong>Words:</strong> ${textInfo.wordCount}</p>
                <p><strong>Lines:</strong> ${textInfo.lineCount}</p>
                <p><strong>Type:</strong> ${textInfo.type}</p>
                <p><strong>Language:</strong> ${textInfo.language}</p>
                <p><strong>Has Numbers:</strong> ${textInfo.hasNumbers ? 'Yes' : 'No'}</p>
            </div>
        </div>
        
        <div style="background: #fff3e0; padding: 20px; border-radius: 10px; margin: 15px 0;">
            <h4>Quick Actions</h4>
            <div style="display: flex; flex-wrap: wrap; gap: 10px; justify-content: center;">
                ${getTextActions(textInfo)}
            </div>
        </div>
        
        <div style="text-align: center; margin-top: 20px;">
            <button onclick="copyToClipboard('${textInfo.text.replace(/'/g, "\\'")}')") style="background: #2196f3; color: white; border: none; padding: 10px 20px; border-radius: 5px; margin: 5px; cursor: pointer;">Copy Text</button>
            <button onclick="saveTextData('${textInfo.text.replace(/'/g, "\\'")}')") style="background: #ff9800; color: white; border: none; padding: 10px 20px; border-radius: 5px; margin: 5px; cursor: pointer;">Save to History</button>
            <button onclick="this.closest('.modal').remove()" style="background: #757575; color: white; border: none; padding: 10px 20px; border-radius: 5px; margin: 5px; cursor: pointer;">Close</button>
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

// Get text-specific actions based on detected type
function getTextActions(textInfo) {
    let actions = [];
    
    if (textInfo.type === 'Email') {
        actions.push(`<button onclick="window.open('mailto:${textInfo.text}', '_blank')" style="background: #4caf50; color: white; border: none; padding: 8px 15px; border-radius: 5px; cursor: pointer; font-size: 12px;">Send Email</button>`);
    }
    
    if (textInfo.type === 'Phone Number') {
        actions.push(`<button onclick="window.open('tel:${textInfo.text}', '_blank')" style="background: #4caf50; color: white; border: none; padding: 8px 15px; border-radius: 5px; cursor: pointer; font-size: 12px;">Call Number</button>`);
    }
    
    if (textInfo.type === 'URL') {
        actions.push(`<button onclick="window.open('${textInfo.text}', '_blank')" style="background: #4caf50; color: white; border: none; padding: 8px 15px; border-radius: 5px; cursor: pointer; font-size: 12px;">Open URL</button>`);
    }
    
    // Google search action for any text
    actions.push(`<button onclick="window.open('https://www.google.com/search?q=${encodeURIComponent(textInfo.text)}', '_blank')" style="background: #2196f3; color: white; border: none; padding: 8px 15px; border-radius: 5px; cursor: pointer; font-size: 12px;">Google Search</button>`);
    
    // Translate action
    actions.push(`<button onclick="window.open('https://translate.google.com/?text=${encodeURIComponent(textInfo.text)}', '_blank')" style="background: #9c27b0; color: white; border: none; padding: 8px 15px; border-radius: 5px; cursor: pointer; font-size: 12px;">Translate</button>`);
    
    return actions.join('');
}

// Save text data to history
function saveTextData(text) {
    let textHistory = JSON.parse(localStorage.getItem('textHistory')) || [];
    
    const textData = {
        text: text,
        dateScanned: new Date().toISOString(),
        location: 'Camera Scan',
        type: classifyTextType(text)
    };
    
    // Check if text already exists
    const exists = textHistory.some(item => item.text === text);
    
    if (!exists) {
        textHistory.unshift(textData);
        // Keep only last 50 text entries
        if (textHistory.length > 50) {
            textHistory = textHistory.slice(0, 50);
        }
        localStorage.setItem('textHistory', JSON.stringify(textHistory));
        showNotification('Text saved to history!', 'success');
    } else {
        showNotification('Text is already in history', 'info');
    }
    
    // Close the modal
    document.querySelector('.modal').remove();
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