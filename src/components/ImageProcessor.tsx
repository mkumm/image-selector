'use client';

import { useState, useEffect, useRef } from 'react';
import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-webgl';

interface GridCell {
  x: number;
  y: number;
  width: number;
  height: number;
  isParticipant: boolean;
  selected?: boolean;
}

const ImageProcessor = ({ imageUrl }: { imageUrl: string }) => {
  const [gridCells, setGridCells] = useState<GridCell[]>([]);
  const [selectedCells, setSelectedCells] = useState<Set<number>>(new Set());
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentSelection, setCurrentSelection] = useState<number | null>(null);
  const [debugInfo, setDebugInfo] = useState<string>('');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  const addDebugInfo = (info: string) => {
    console.log(info);
    setDebugInfo(prev => prev + '\n' + info);
  };

  const detectEdges = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;

    // Arrays to store the positions of detected edges
    const horizontalEdges = new Set<number>();
    const verticalEdges = new Set<number>();

    // Detect horizontal edges
    for (let y = 1; y < height - 1; y++) {
      let edgeStrength = 0;
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const aboveIdx = ((y - 1) * width + x) * 4;
        const belowIdx = ((y + 1) * width + x) * 4;

        // Calculate color difference between pixels above and below
        const diff = Math.abs(data[aboveIdx] - data[belowIdx]) +
                    Math.abs(data[aboveIdx + 1] - data[belowIdx + 1]) +
                    Math.abs(data[aboveIdx + 2] - data[belowIdx + 2]);

        if (diff > 100) { // Threshold for edge detection
          edgeStrength++;
        }
      }

      // If enough edge pixels are found in a row, consider it a grid line
      if (edgeStrength > width * 0.3) { // 30% threshold
        horizontalEdges.add(y);
      }
    }

    // Detect vertical edges using the same approach
    for (let x = 1; x < width - 1; x++) {
      let edgeStrength = 0;
      for (let y = 0; y < height; y++) {
        const idx = (y * width + x) * 4;
        const leftIdx = (y * width + (x - 1)) * 4;
        const rightIdx = (y * width + (x + 1)) * 4;

        const diff = Math.abs(data[leftIdx] - data[rightIdx]) +
                    Math.abs(data[leftIdx + 1] - data[rightIdx + 1]) +
                    Math.abs(data[leftIdx + 2] - data[rightIdx + 2]);

        if (diff > 100) {
          edgeStrength++;
        }
      }

      if (edgeStrength > height * 0.3) {
        verticalEdges.add(x);
      }
    }

    // Convert Sets to sorted arrays
    const hEdges = Array.from(horizontalEdges).sort((a, b) => a - b);
    const vEdges = Array.from(verticalEdges).sort((a, b) => a - b);

    addDebugInfo(`Found ${hEdges.length} horizontal and ${vEdges.length} vertical edges`);

    // Create cells from edge intersections
    const cells: GridCell[] = [];

    // Group edges that are close together (within 10 pixels)
    const groupedHEdges = groupClosePoints(hEdges, 10);
    const groupedVEdges = groupClosePoints(vEdges, 10);

    addDebugInfo(`Grouped into ${groupedHEdges.length} horizontal and ${groupedVEdges.length} vertical lines`);

    // Create cells from the intersections
    for (let i = 0; i < groupedHEdges.length - 1; i++) {
      for (let j = 0; j < groupedVEdges.length - 1; j++) {
        const cell: GridCell = {
          x: groupedVEdges[j],
          y: groupedHEdges[i],
          width: groupedVEdges[j + 1] - groupedVEdges[j],
          height: groupedHEdges[i + 1] - groupedHEdges[i],
          isParticipant: true
        };

        // Filter out cells that are too small or too large
        if (cell.width > 50 && cell.height > 50 &&
            cell.width < width * 0.9 && cell.height < height * 0.9) {
          cells.push(cell);
        }
      }
    }

    return cells;
  };

  // Helper function to group close points
  const groupClosePoints = (points: number[], threshold: number): number[] => {
    if (points.length === 0) return [];

    const groups: number[][] = [[points[0]]];

    for (let i = 1; i < points.length; i++) {
      const lastGroup = groups[groups.length - 1];
      const lastPoint = lastGroup[lastGroup.length - 1];

      if (points[i] - lastPoint < threshold) {
        lastGroup.push(points[i]);
      } else {
        groups.push([points[i]]);
      }
    }

    // Return the average value for each group
    return groups.map(group =>
      Math.round(group.reduce((sum, val) => sum + val, 0) / group.length)
    );
  };

  const selectRandomParticipant = () => {
    const availableCells = gridCells
      .map((_, index) => index)
      .filter(index => !selectedCells.has(index));

    if (availableCells.length === 0) {
      addDebugInfo('All participants have been selected');
      return;
    }

    const randomIndex = Math.floor(Math.random() * availableCells.length);
    const selectedIndex = availableCells[randomIndex];

    setCurrentSelection(selectedIndex);
    setSelectedCells(prev => new Set([...prev, selectedIndex]));

    // Redraw canvas with updated selections
    drawResults();
  };

  const resetSelections = () => {
    setSelectedCells(new Set());
    setCurrentSelection(null);
    drawResults();
  };

  const drawResults = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !imageRef.current) return;

    // Redraw original image
    ctx.drawImage(imageRef.current, 0, 0);

    // Draw all cells
    gridCells.forEach((cell, index) => {
      // Different styles for different states
      if (index === currentSelection) {
        // Current selection: thick green border
        ctx.strokeStyle = '#00FF00';
        ctx.lineWidth = 4;
      } else if (selectedCells.has(index)) {
        // Previously selected: thin blue border
        ctx.strokeStyle = '#0088FF';
        ctx.lineWidth = 2;
      } else {
        // Unselected: thin gray border
        ctx.strokeStyle = '#666666';
        ctx.lineWidth = 1;
      }

      ctx.strokeRect(cell.x, cell.y, cell.width, cell.height);

      // Add cell number
      ctx.fillStyle = selectedCells.has(index) ? '#0088FF' : '#666666';
      ctx.font = '16px Arial';
      ctx.fillText(`${index + 1}`, cell.x + 5, cell.y + 20);
    });
  };

  useEffect(() => {
    const initializeTensorFlow = async () => {
      await tf.ready();
      const backendName = tf.findBackend('webgl') ? 'webgl' : 'cpu';
      await tf.setBackend(backendName);
      console.log('Using backend:', backendName);
    };

    initializeTensorFlow();
  }, []);

  useEffect(() => {
    const processImage = async () => {
      addDebugInfo('Starting image processing');
      setIsProcessing(true);

      try {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');

        if (!canvas || !ctx || !imageRef.current) {
          addDebugInfo('Missing canvas, context, or image reference');
          return;
        }

        addDebugInfo(`Image dimensions: ${imageRef.current.width}x${imageRef.current.height}`);

        // Set canvas size to match image
        canvas.width = imageRef.current.width;
        canvas.height = imageRef.current.height;

        // Draw image
        ctx.drawImage(imageRef.current, 0, 0);
        addDebugInfo('Drew image to canvas');

        // Detect grid
        const cells = detectEdges(ctx, canvas.width, canvas.height);
        setGridCells(cells);
        addDebugInfo(`Detected ${cells.length} grid cells`);

        // Draw initial results
        drawResults();

      } catch (error) {
        addDebugInfo(`Error: ${error}`);
        console.error('Error processing image:', error);
      } finally {
        setIsProcessing(false);
      }
    };

    if (imageUrl) {
      addDebugInfo('Image URL received');
      if (imageRef.current) {
        if (imageRef.current.complete) {
          addDebugInfo('Image already loaded');
          processImage();
        } else {
          addDebugInfo('Setting up image load handler');
          imageRef.current.onload = () => {
            addDebugInfo('Image loaded');
            processImage();
          };
        }
      }
    }
  }, [imageUrl]);

  return (
    <div className="relative w-full max-w-2xl mx-auto">
      {isProcessing && (
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 text-white z-10">
          Processing image...
        </div>
      )}
      <div className="relative">
        <img
          ref={imageRef}
          src={imageUrl}
          alt="Original"
          className="hidden"
          onError={() => addDebugInfo('Error loading image')}
        />
        <canvas
          ref={canvasRef}
          className="w-full rounded-lg shadow-lg"
        />
      </div>

      {gridCells.length > 0 && (
        <div className="mt-4 space-y-4">
          <div className="p-4 bg-gray-100 rounded-lg">
            <h3 className="font-bold mb-2">Detected Participants: {gridCells.length}</h3>
            <p className="text-sm text-gray-600 mb-4">
              Selected: {selectedCells.size} of {gridCells.length}
            </p>
            <div className="flex space-x-4">
              <button
                onClick={selectRandomParticipant}
                disabled={selectedCells.size === gridCells.length}
                className={`px-4 py-2 rounded-lg ${
                  selectedCells.size === gridCells.length
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-blue-500 hover:bg-blue-600'
                } text-white`}
              >
                Select Random Participant
              </button>
              <button
                onClick={resetSelections}
                disabled={selectedCells.size === 0}
                className={`px-4 py-2 rounded-lg ${
                  selectedCells.size === 0
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-red-500 hover:bg-red-600'
                } text-white`}
              >
                Reset Selections
              </button>
            </div>
          </div>

          {currentSelection !== null && (
            <div className="p-4 bg-green-100 rounded-lg">
              <h3 className="font-bold text-green-800">
                Currently Selected: Participant {currentSelection + 1}
              </h3>
            </div>
          )}
        </div>
      )}

      <div className="mt-4 p-4 bg-gray-100 rounded-lg">
        <h3 className="font-bold mb-2">Debug Info:</h3>
        <pre className="text-xs whitespace-pre-wrap">
          {debugInfo}
        </pre>
      </div>
    </div>
  );
};

export default ImageProcessor;
