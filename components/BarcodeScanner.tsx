import React, { useState, useRef, useCallback, useEffect } from 'react';
import { BrowserMultiFormatReader, Result } from '@zxing/library';

interface BarcodeScannerProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (data: string) => void;
}

const BarcodeScanner: React.FC<BarcodeScannerProps> = ({ isOpen, onClose, onScan }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const codeReaderRef = useRef<BrowserMultiFormatReader | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const isScanningRef = useRef(false);

  const stopScanning = useCallback(() => {
    // Stop the video stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    // Clear video source
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    
    // Stop the code reader
    if (codeReaderRef.current) {
      codeReaderRef.current.reset();
      codeReaderRef.current = null;
    }
    
    setIsScanning(false);
    isScanningRef.current = false;
  }, []);

  const startScanning = useCallback(async () => {
    if (isScanningRef.current) return;
    
    try {
      console.log('Starting barcode scanner...');
      setIsScanning(true);
      isScanningRef.current = true;
      setError(null);

      // Get camera stream directly
      console.log('Requesting camera access...');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });
      
      console.log('Camera access granted');
      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        console.log('Setting video source...');
        
        videoRef.current.addEventListener('loadedmetadata', () => {
          console.log('Video metadata loaded');
          console.log('Video dimensions:', videoRef.current?.videoWidth, 'x', videoRef.current?.videoHeight);
        });
        
        // Don't play video manually - let the library handle it
        console.log('Video source set, letting library handle playback');
        
        // Initialize the code reader
        codeReaderRef.current = new BrowserMultiFormatReader();
        console.log('Code reader initialized');
        
        // Start decoding from the video element
        codeReaderRef.current.decodeFromVideoElementContinuously(
          videoRef.current,
          (result: Result | null, error: any) => {
            if (error) {
              console.log('Decode error:', error);
            }
            if (result) {
              console.log('Barcode detected:', result.getText());
              onScan(result.getText());
              stopScanning();
            }
          }
        );
        console.log('Decode started');
      }
    } catch (err) {
      console.error('Scanner error:', err);
      setError('Failed to access camera. Please ensure camera permissions are granted.');
      stopScanning();
    }
  }, [onScan, stopScanning]);

  useEffect(() => {
    if (isOpen) {
      startScanning();
    }
    
    return () => {
      stopScanning();
    };
  }, [isOpen, startScanning, stopScanning]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-2xl p-6 max-w-lg w-full">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-black text-gray-100">Scan Barcode</h2>
          <button
            onClick={() => {
              stopScanning();
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
            style={{ display: 'block' }}
          />
          {!isScanning && !error && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <svg className="w-16 h-16 mx-auto mb-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"></path>
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
          {/* Barcode scanning overlay */}
          {isScanning && (
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-red-500 transform -translate-y-1/2"></div>
              <div className="absolute top-0 bottom-0 left-1/4 w-0.5 bg-red-500"></div>
              <div className="absolute top-0 bottom-0 right-1/4 w-0.5 bg-red-500"></div>
            </div>
          )}
        </div>
        <div className="text-center">
          <p className="text-sm text-gray-400 mb-4">
            Position the barcode within the frame to scan
          </p>
          <button
            onClick={() => {
              stopScanning();
              onClose();
            }}
            className="px-6 py-2 bg-gray-700 text-gray-300 rounded-xl font-bold hover:bg-gray-600">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default BarcodeScanner;
