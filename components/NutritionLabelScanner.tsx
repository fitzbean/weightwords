import React, { useState, useRef, useCallback, useEffect } from 'react';
import { extractNutritionFromImages, extractNutritionFromImage, getNutritionFromProductImage } from '../services/geminiService';
import { NutritionEstimate } from '../types';

interface NutritionLabelScannerProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (nutritionText: string) => void;
  onScanEstimate?: (estimate: NutritionEstimate) => void;
}

type CaptureStep = 'product' | 'nutrition';

const NutritionLabelScanner: React.FC<NutritionLabelScannerProps> = ({ isOpen, onClose, onScan, onScanEstimate }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [captureStep, setCaptureStep] = useState<CaptureStep>('product');
  const [productImage, setProductImage] = useState<string | null>(null);

  const resetState = useCallback(() => {
    console.log('resetState called');
    setCaptureStep('product');
    setProductImage(null);
    setError(null);
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsScanning(false);
  }, []);

  const startCamera = useCallback(async () => {
    try {
      console.log('Starting camera...');
      setIsScanning(true);
      setError(null);

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });
      
      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        
        // Wait for video metadata to load
        await new Promise((resolve) => {
          if (videoRef.current) {
            if (videoRef.current.readyState >= 2) {
              resolve(null);
            } else {
              videoRef.current.onloadedmetadata = () => resolve(null);
            }
          }
        });
        
        console.log('Camera ready', {
          videoWidth: videoRef.current.videoWidth,
          videoHeight: videoRef.current.videoHeight,
          readyState: videoRef.current.readyState
        });
        
        // Ensure scanning stays true after camera is ready
        setIsScanning(true);
      }
    } catch (err) {
      console.error('Camera error:', err);
      setError('Failed to access camera. Please ensure camera permissions are granted.');
      setIsScanning(false);
    }
  }, []);

  const captureImage = useCallback((): string | null => {
    if (!videoRef.current || !canvasRef.current) {
      console.log('Missing video or canvas ref');
      return null;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    if (!context) return null;

    // Check if video has dimensions
    if (video.videoWidth === 0 || video.videoHeight === 0) {
      console.log('Video dimensions not ready', {
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
        readyState: video.readyState
      });
      return null;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    const imageData = canvas.toDataURL('image/jpeg', 0.8);
    return imageData.split(',')[1];
  }, []);

  const handleCapture = useCallback(async () => {
    // Force check the current state
    const currentState = {
      isScanning,
      isProcessing,
      captureStep,
      hasVideo: !!videoRef.current,
      videoReady: videoRef.current ? videoRef.current.readyState >= 2 : false
    };
    
    console.log('handleCapture called', currentState);
    
    if (!currentState.isScanning || currentState.isProcessing) {
      console.log('Early return - not ready', currentState);
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const imageData = captureImage();
      console.log('Image captured', imageData ? 'success' : 'failed');
      
      if (captureStep === 'product') {
        setProductImage(imageData);
        setCaptureStep('nutrition');
        setIsProcessing(false);
      } else {
        // Final step - analyze both images
        const nutritionText = await extractNutritionFromImages(productImage!, imageData);
        
        if (nutritionText) {
          stopCamera();
          resetState();
          onClose();
          onScan(nutritionText);
        } else {
          setError('Could not read nutrition info. Please try again.');
          setIsProcessing(false);
        }
      }
    } catch (err) {
      console.error('Error analyzing images:', err);
      setError('Failed to analyze images. Please try again.');
      setIsProcessing(false);
    }
  }, [isScanning, isProcessing, captureStep, productImage, captureImage, onScan, stopCamera, resetState, onClose]);

  const handleSkipLabel = useCallback(async () => {
    if (!productImage || isProcessing) return;

    setIsProcessing(true);
    setError(null);

    try {
      // Identify product from image and search web for nutrition
      const estimate = await getNutritionFromProductImage(productImage);
      
      if (estimate && onScanEstimate) {
        stopCamera();
        resetState();
        onClose();
        onScanEstimate(estimate);
      } else if (estimate) {
        // Fallback to text-based flow if onScanEstimate not provided
        const item = estimate.items[0];
        const nutritionText = `${item.name}, ${estimate.servingSize || '1 serving'}, ${item.calories} calories, ${item.protein}g protein, ${item.carbs}g carbs, ${item.fat}g fat`;
        stopCamera();
        resetState();
        onClose();
        onScan(nutritionText);
      } else {
        setError('Could not identify the product. Please try again.');
      }
    } catch (err) {
      console.error('Error analyzing product:', err);
      setError('Failed to analyze product. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  }, [productImage, isProcessing, onScan, onScanEstimate, stopCamera, resetState, onClose]);

  const handleBack = useCallback(() => {
    setCaptureStep('product');
    setProductImage(null);
    setError(null);
  }, []);

  const handleClose = useCallback(() => {
    stopCamera();
    resetState();
    onClose();
  }, [stopCamera, resetState, onClose]);

  useEffect(() => {
    if (isOpen) {
      resetState();
      startCamera();
    } else {
      stopCamera();
    }
    
    return () => {
      stopCamera();
    };
  }, [isOpen, startCamera, stopCamera, resetState]);

  if (!isOpen) return null;

  const stepInfo = captureStep === 'product' 
    ? { title: 'Step 1: Product Front', instruction: 'Point camera at the front of the product (name/brand visible)' }
    : { title: 'Step 2: Nutrition Label', instruction: 'Now point camera at the nutrition facts label' };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-2xl p-6 max-w-lg w-full">
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-2xl font-black text-gray-100">Scan Product</h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-200 text-2xl leading-none"
          >
            ×
          </button>
        </div>
        
        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-4">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
            captureStep === 'product' ? 'bg-green-500 text-white' : 'bg-gray-600 text-gray-300'
          }`}>
            {productImage ? '✓' : '1'}
          </div>
          <div className="flex-1 h-1 bg-gray-600 rounded">
            <div className={`h-full bg-green-500 rounded transition-all ${productImage ? 'w-full' : 'w-0'}`}></div>
          </div>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
            captureStep === 'nutrition' ? 'bg-green-500 text-white' : 'bg-gray-600 text-gray-300'
          }`}>
            2
          </div>
        </div>
        
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">{stepInfo.title}</p>
        
        <div className="relative bg-black rounded-xl overflow-hidden mb-4">
          <video
            ref={videoRef}
            className="w-full h-64 object-cover"
            playsInline
            muted
          />
          <canvas ref={canvasRef} className="hidden" />
          
          {!isScanning && !error && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <svg className="w-16 h-16 mx-auto mb-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"></path>
                </svg>
                <p className="text-gray-400">Initializing camera...</p>
              </div>
            </div>
          )}
          
          {error && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center px-4">
                <svg className="w-16 h-16 mx-auto mb-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"/>
                </svg>
                <p className="text-red-400">{error}</p>
              </div>
            </div>
          )}
          
          {isProcessing && (
            <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
              <div className="text-center">
                <svg className="animate-spin h-12 w-12 mx-auto mb-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <p className="text-white font-bold">Analyzing product...</p>
              </div>
            </div>
          )}
          
          {/* Scanning frame overlay */}
          {isScanning && !isProcessing && (
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute inset-4 border-2 border-white border-opacity-50 rounded-lg"></div>
              <div className={`absolute top-4 left-4 w-8 h-8 border-t-4 border-l-4 rounded-tl-lg ${captureStep === 'product' ? 'border-blue-400' : 'border-green-400'}`}></div>
              <div className={`absolute top-4 right-4 w-8 h-8 border-t-4 border-r-4 rounded-tr-lg ${captureStep === 'product' ? 'border-blue-400' : 'border-green-400'}`}></div>
              <div className={`absolute bottom-4 left-4 w-8 h-8 border-b-4 border-l-4 rounded-bl-lg ${captureStep === 'product' ? 'border-blue-400' : 'border-green-400'}`}></div>
              <div className={`absolute bottom-4 right-4 w-8 h-8 border-b-4 border-r-4 rounded-br-lg ${captureStep === 'product' ? 'border-blue-400' : 'border-green-400'}`}></div>
            </div>
          )}
        </div>
        
        <div className="text-center">
          <p className="text-sm text-gray-400 mb-4">
            {stepInfo.instruction}
          </p>
          <div className="flex gap-3 justify-center">
            {captureStep === 'nutrition' && (
              <button
                onClick={handleSkipLabel}
                disabled={isProcessing}
                className="px-6 py-2 bg-purple-600 text-white rounded-xl font-bold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-purple-500"
              >
                {isProcessing ? 'Searching...' : 'No Nutrition Label'}
              </button>
            )}
            <button
              onClick={handleCapture}
              disabled={!isScanning || isProcessing}
              className={`px-6 py-2 text-white rounded-xl font-bold disabled:opacity-50 disabled:cursor-not-allowed ${
                captureStep === 'product' ? 'bg-blue-600 hover:bg-blue-500' : 'bg-green-600 hover:bg-green-500'
              }`}
              style={{ 
                opacity: !isScanning || isProcessing ? 0.5 : 1,
                cursor: !isScanning || isProcessing ? 'not-allowed' : 'pointer'
              }}
            >
              {isProcessing ? 'Analyzing...' : captureStep === 'product' ? `Capture Product` : 'Capture Nutrition Label'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NutritionLabelScanner;
