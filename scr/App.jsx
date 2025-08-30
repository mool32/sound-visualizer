import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, MicOff, Volume2 } from 'lucide-react';

const SoundVisualizer = () => {
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState('');
  const [audioData, setAudioData] = useState({
    frequencyData: new Uint8Array(256),
    volume: 0,
    dominantFreq: 0,
    soundType: 'тишина'
  });

  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const streamRef = useRef(null);
  const animationRef = useRef(null);
  const canvasRef = useRef(null);
  const spectrogramRef = useRef(null);

  const startListening = async () => {
    try {
      setError('');
      
      // Получаем доступ к микрофону
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { 
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        } 
      });
      
      streamRef.current = stream;
      
      // Создаем аудио контекст
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      
      // Настраиваем анализатор
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 512;
      analyserRef.current.smoothingTimeConstant = 0.8;
      
      source.connect(analyserRef.current);
      
      setIsListening(true);
      startAnalysis();
      
    } catch (err) {
      setError('Не удалось получить доступ к микрофону. Проверьте разрешения.');
      console.error('Microphone access error:', err);
    }
  };

  const stopListening = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
    }
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
    
    setIsListening(false);
    setAudioData({
      frequencyData: new Uint8Array(256),
      volume: 0,
      dominantFreq: 0,
      soundType: 'тишина'
    });
  };

  const startAnalysis = () => {
    if (!analyserRef.current) return;

    const bufferLength = analyserRef.current.frequencyBinCount;
    const frequencyData = new Uint8Array(bufferLength);
    const timeData = new Uint8Array(bufferLength);

    const analyze = () => {
      analyserRef.current.getByteFrequencyData(frequencyData);
      analyserRef.current.getByteTimeDomainData(timeData);

      // Вычисляем громкость
      const volume = frequencyData.reduce((sum, value) => sum + value, 0) / frequencyData.length;
      
      // Находим доминирующую частоту
      let maxValue = 0;
      let maxIndex = 0;
      for (let i = 0; i < frequencyData.length; i++) {
        if (frequencyData[i] > maxValue) {
          maxValue = frequencyData[i];
          maxIndex = i;
        }
      }
      
      const sampleRate = audioContextRef.current.sampleRate;
      const dominantFreq = (maxIndex * sampleRate) / (analyserRef.current.fftSize * 2);
      
      // Определяем тип звука
      const soundType = getSoundType(volume, dominantFreq, frequencyData);
      
      setAudioData({
        frequencyData: new Uint8Array(frequencyData),
        volume: Math.round(volume),
        dominantFreq: Math.round(dominantFreq),
        soundType
      });

      drawVisualization(frequencyData);
      updateSpectrogram(frequencyData);
      
      animationRef.current = requestAnimationFrame(analyze);
    };

    analyze();
  };

  const getSoundType = (volume, dominantFreq, frequencyData) => {
    if (volume < 10) return 'тишина';
    
    // Анализируем спектр для определения типа звука
    const lowFreq = frequencyData.slice(0, 85).reduce((a, b) => a + b, 0) / 85;
    const midFreq = frequencyData.slice(85, 170).reduce((a, b) => a + b, 0) / 85;
    const highFreq = frequencyData.slice(170).reduce((a, b) => a + b, 0) / (frequencyData.length - 170);
    
    if (midFreq > lowFreq && midFreq > highFreq && dominantFreq > 200 && dominantFreq < 3000) {
      return 'речь';
    } else if (highFreq > 40 && volume > 30) {
      return 'музыка';
    } else if (lowFreq > midFreq && lowFreq > highFreq) {
      return 'низкочастотный шум';
    } else if (highFreq > lowFreq && highFreq > midFreq) {
      return 'высокочастотный звук';
    } else {
      return 'окружающий шум';
    }
  };

  const drawVisualization = (frequencyData) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    // Частотные полосы
    const barCount = 32;
    const barWidth = width / barCount;
    
    for (let i = 0; i < barCount; i++) {
      const dataIndex = Math.floor(i * frequencyData.length / barCount);
      const barHeight = (frequencyData[dataIndex] / 255) * height * 0.8;
      
      const hue = (i / barCount) * 60 + 200; // От синего к зеленому
      const saturation = Math.min(100, frequencyData[dataIndex] / 2);
      const lightness = 50 + (frequencyData[dataIndex] / 255) * 30;
      
      ctx.fillStyle = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
      ctx.fillRect(i * barWidth, height - barHeight, barWidth - 1, barHeight);
    }

    // Абстрактные формы
    drawAbstractForms(ctx, frequencyData, width, height);
  };

  const drawAbstractForms = (ctx, frequencyData, width, height) => {
    const centerX = width / 2;
    const centerY = height / 2;
    
    // Основной круг
    const avgFreq = frequencyData.reduce((sum, val) => sum + val, 0) / frequencyData.length;
    const radius = (avgFreq / 255) * 60 + 20;
    
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
    ctx.strokeStyle = `rgba(100, 200, 255, ${avgFreq / 255})`;
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // Лучи
    const rayCount = 8;
    for (let i = 0; i < rayCount; i++) {
      const angle = (i / rayCount) * 2 * Math.PI;
      const dataIndex = Math.floor(i * frequencyData.length / rayCount);
      const rayLength = (frequencyData[dataIndex] / 255) * 80;
      
      const x1 = centerX + Math.cos(angle) * radius;
      const y1 = centerY + Math.sin(angle) * radius;
      const x2 = centerX + Math.cos(angle) * (radius + rayLength);
      const y2 = centerY + Math.sin(angle) * (radius + rayLength);
      
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = `rgba(255, 150, 100, ${frequencyData[dataIndex] / 255})`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  };

  const updateSpectrogram = (frequencyData) => {
    const canvas = spectrogramRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    // Сдвигаем изображение влево
    const imageData = ctx.getImageData(1, 0, width - 1, height);
    ctx.putImageData(imageData, 0, 0);

    // Рисуем новый столбец справа
    for (let i = 0; i < height; i++) {
      const dataIndex = Math.floor(i * frequencyData.length / height);
      const intensity = frequencyData[dataIndex];
      const hue = 240 - (intensity / 255) * 60; // От синего к красному
      const saturation = 80;
      const lightness = (intensity / 255) * 60 + 10;
      
      ctx.fillStyle = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
      ctx.fillRect(width - 1, height - i - 1, 1, 1);
    }
  };

  useEffect(() => {
    return () => {
      stopListening();
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const spectrogram = spectrogramRef.current;
    
    if (canvas) {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    }
    
    if (spectrogram) {
      spectrogram.width = spectrogram.offsetWidth;
      spectrogram.height = spectrogram.offsetHeight;
    }
  }, []);

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-6xl mx-auto">
        {/* Заголовок и управление */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-light mb-4">Визуализатор окружающих звуков</h1>
          
          <button
            onClick={isListening ? stopListening : startListening}
            className={`px-6 py-3 rounded-lg flex items-center gap-2 mx-auto transition-colors ${
              isListening 
                ? 'bg-red-600 hover:bg-red-700' 
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            {isListening ? 'Остановить' : 'Начать анализ'}
          </button>
          
          {error && (
            <div className="mt-4 p-3 bg-red-800/50 rounded-lg text-red-200">
              {error}
            </div>
          )}
        </div>

        {/* Информационная панель */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-gray-800/50 rounded-lg p-4 text-center">
            <div className="text-sm text-gray-400 mb-1">Громкость</div>
            <div className="text-2xl font-light">{audioData.volume}</div>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-4 text-center">
            <div className="text-sm text-gray-400 mb-1">Доминирующая частота</div>
            <div className="text-2xl font-light">{audioData.dominantFreq} Гц</div>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-4 text-center">
            <div className="text-sm text-gray-400 mb-1">Тип звука</div>
            <div className="text-lg font-light capitalize">{audioData.soundType}</div>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-4 text-center">
            <div className="text-sm text-gray-400 mb-1">Статус</div>
            <div className={`text-lg font-light ${isListening ? 'text-green-400' : 'text-gray-400'}`}>
              {isListening ? 'Активен' : 'Остановлен'}
            </div>
          </div>
        </div>

        {/* Основная визуализация */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Частотные полосы и абстрактные формы */}
          <div className="bg-gray-800/30 rounded-lg p-4">
            <h3 className="text-lg font-light mb-4 flex items-center gap-2">
              <Volume2 className="w-5 h-5" />
              Частотный анализ
            </h3>
            <canvas
              ref={canvasRef}
              className="w-full h-64 bg-gray-900/50 rounded"
              style={{ imageRendering: 'pixelated' }}
            />
          </div>

          {/* Спектрограмма */}
          <div className="bg-gray-800/30 rounded-lg p-4">
            <h3 className="text-lg font-light mb-4">Спектрограмма</h3>
            <canvas
              ref={spectrogramRef}
              className="w-full h-64 bg-gray-900/50 rounded"
              style={{ imageRendering: 'pixelated' }}
            />
            <div className="text-xs text-gray-400 mt-2">
              Время →
            </div>
          </div>
        </div>

        {/* Описание */}
        <div className="mt-8 text-center text-gray-400">
          <p className="text-sm">
            Анализ звуковой среды в реальном времени. 
            Нажмите "Начать анализ" и разрешите доступ к микрофону.
          </p>
        </div>
      </div>
    </div>
  );
};

export default SoundVisualizer;