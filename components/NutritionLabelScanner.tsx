import React, { useState, useRef, useCallback, useEffect } from 'react';

interface NutritionLabelScannerProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (nutritionText: string) => void;
}

const NutritionLabelScanner: React.FC<NutritionLabelScannerProps> = ({ isOpen, onClose, onScan }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

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
      setIsScanning(true);
      setError(null);

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });
      
      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (err) {
      setError('Failed to access camera. Please ensure camera permissions are granted.');
      setIsScanning(false);
    }
  }, []);

  const captureAndAnalyze = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || isProcessing) return;

    setIsProcessing(true);

    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');

      if (!context) {
        throw new Error('Could not get canvas context');
      }

      // Set canvas size to match video
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      // Draw current video frame to canvas
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Convert to base64
      const imageData = canvas.toDataURL('image/jpeg', 0.8);
      const base64Image = imageData.split(',')[1];

      // Send to Gemini Vision API
      const { extractNutritionFromImage } = await import('../services/geminiService');
      const nutritionText = await extractNutritionFromImage(base64Image);

      if (nutritionText) {
        onScan(nutritionText);
        stopCamera();
        onClose();
      } else {
        setError('Could not read nutrition label. Please try again with better lighting or positioning.');
      }
    } catch (err) {
      console.error('Error analyzing image:', err);
      setError('Failed to analyze image. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  }, [isProcessing, onScan, onClose, stopCamera]);

  useEffect(() => {
    if (isOpen) {
      startCamera();
    } else {
      stopCamera();
    }
    
    return () => {
      stopCamera();
    };
  }, [isOpen, startCamera, stopCamera]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-2xl p-6 max-w-lg w-full">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-black text-gray-100">Scan Nutrition Label</h2>
          <button
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="text-gray-400 hover:text-gray-200 text-2xl leading-none"
          >
            ×
          </button>
        </div>
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
                <p className="text-white font-bold">Analyzing nutrition label...</p>
              </div>
            </div>
          )}
          
          {/* Scanning frame overlay */}
          {isScanning && !isProcessing && (
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute inset-4 border-2 border-white border-opacity-50 rounded-lg"></div>
              <div className="absolute top-4 left-4 w-8 h-8 border-t-4 border-l-4 border-green-400 rounded-tl-lg"></div>
              <div className="absolute top-4 right-4 w-8 h-8 border-t-4 border-r-4 border-green-400 rounded-tr-lg"></div>
              <div className="absolute bottom-4 left-4 w-8 h-8 border-b-4 border-l-4 border-green-400 rounded-bl-lg"></div>
              <div className="absolute bottom-4 right-4 w-8 h-8 border-b-4 border-r-4 border-green-400 rounded-br-lg"></div>
            </div>
          )}
        </div>
        
        <div className="text-center">
          <p className="text-sm text-gray-400 mb-4">
            Point camera at the nutrition facts label
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => {
                stopCamera();
                onClose();
              }}
              className="px-6 py-2 bg-gray-700 text-gray-300 rounded-xl font-bold hover:bg-gray-600"
            >
              Cancel
            </button>
            <button
              onClick={captureAndAnalyze}
              disabled={!isScanning || isProcessing}
              className="px-6 py-2 bg-green-600 text-white rounded-xl font-bold hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isProcessing ? 'Analyzing...' : 'Capture'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NutritionLabelScanner;
