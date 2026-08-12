import React, { useRef, useState, useEffect } from 'react';
import { Play, Pause, Rewind, FastForward, Repeat, UploadCloud, Mic, Subtitles, Radio } from 'lucide-react';

const LiveRadio = ({ onAudioUpload, isLive, currentAnalysis, onPlaybackProgress, onLiveSpeechUpdate, clips = [], sessionLabel, onClipSelect, apiBase }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [activeClipId, setActiveClipId] = useState(null);
  const [activeSession, setActiveSession] = useState(null);

  // Distinct race sessions present in the clip library
  const sessions = [];
  clips.forEach(c => {
    if (!sessions.find(s => s.key === c.session_key)) {
      sessions.push({ key: c.session_key, label: c.session_label || 'Session' });
    }
  });
  const currentSession = activeSession != null && sessions.find(s => s.key === activeSession)
    ? activeSession
    : (sessions[0]?.key ?? null);
  const visibleClips = sessions.length > 1 ? clips.filter(c => c.session_key === currentSession) : clips;
  const shortLabel = (label) => (label || '').replace(/^\d{4}\s*/, '').replace(/\s*Race$/i, '') || 'Session';
  
  const audioRef = useRef(null);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const sourceRef = useRef(null);
  const animationRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const speechRecognitionRef = useRef(null);
  const chunksRef = useRef([]);

  useEffect(() => {
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        try { audioCtxRef.current.close(); } catch(e){}
      }
      if (speechRecognitionRef.current) {
        try { speechRecognitionRef.current.stop(); } catch(e){}
      }
    };
  }, []);

  const initAudioVisualizer = () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      analyserRef.current = audioCtxRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      
      sourceRef.current = audioCtxRef.current.createMediaElementSource(audioRef.current);
      sourceRef.current.connect(analyserRef.current);
      analyserRef.current.connect(audioCtxRef.current.destination);
    }
    
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
  };

  const drawWaveform = () => {
    if (!canvasRef.current || !analyserRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    
    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    analyserRef.current.getByteTimeDomainData(dataArray);
    
    ctx.fillStyle = '#141420';
    ctx.fillRect(0, 0, width, height);
    
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#e74c3c';
    ctx.beginPath();
    
    const sliceWidth = width * 1.0 / bufferLength;
    let x = 0;
    
    for (let i = 0; i < bufferLength; i++) {
      const v = dataArray[i] / 128.0;
      const y = v * height / 2;
      
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
      
      x += sliceWidth;
    }
    
    ctx.lineTo(canvas.width, canvas.height / 2);
    ctx.stroke();
    
    animationRef.current = requestAnimationFrame(drawWaveform);
  };

  const handlePlayPause = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
        if (animationRef.current) cancelAnimationFrame(animationRef.current);
      } else {
        try { initAudioVisualizer(); } catch(e){}
        audioRef.current.play();
        setIsPlaying(true);
        drawWaveform();
      }
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      const cur = audioRef.current.currentTime;
      setCurrentTime(cur);
      if (onPlaybackProgress) {
        onPlaybackProgress(cur);
      }
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const handleAudioEnded = () => {
    setIsPlaying(false);
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
  };

  const formatTime = (time) => {
    if (isNaN(time)) return "0:00";
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleFileDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInput = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      processFile(e.target.files[0]);
    }
  };

  // Instant playback; real transcript arrives from Whisper (backend) — no fabricated subtitles.
  const processFile = async (file) => {
    const url = URL.createObjectURL(file);

    // 1. Play audio immediately
    if (audioRef.current) {
      audioRef.current.src = url;
      audioRef.current.load();
      try { initAudioVisualizer(); } catch(e){}
      audioRef.current.play().then(() => {
        setIsPlaying(true);
        drawWaveform();
      }).catch(err => console.log("Auto-play permission:", err));
    }

    // 2. Send to backend: Whisper ASR + emotion pipeline (subtitles show real words when ready)
    if (onAudioUpload) {
      onAudioUpload(file);
    }
  };

  // Play a real F1 radio clip from the library and trigger backend analysis
  const playClip = (clip) => {
    setActiveClipId(clip.id);
    if (audioRef.current) {
      audioRef.current.src = `${apiBase}/api/sample-clips/${clip.id}/audio`;
      audioRef.current.load();
      try { initAudioVisualizer(); } catch(e){}
      audioRef.current.play().then(() => {
        setIsPlaying(true);
        drawWaveform();
      }).catch(err => console.log("Clip play:", err));
    }
    if (onClipSelect) onClipSelect(clip);
  };

  const formatLapTime = (secs) => {
    if (!secs) return null;
    const m = Math.floor(secs / 60);
    const s = (secs % 60).toFixed(3);
    return `${m}:${s.padStart(6, '0')}`;
  };

  const toggleRecording = async () => {
    if (isRecording) {
      if (speechRecognitionRef.current) {
        try { speechRecognitionRef.current.stop(); } catch(e){}
      }
      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.stop();
      }
      setIsRecording(false);
    } else {
      try {
        const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRec) {
          const rec = new SpeechRec();
          rec.continuous = true;
          rec.interimResults = true;
          rec.lang = 'en-US';
          rec.onresult = (event) => {
            let interim = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
              interim += event.results[i][0].transcript;
            }
            if (interim && onLiveSpeechUpdate) {
              const words = interim.split(' ');
              const step = 0.35;
              const liveWordTs = words.map((w, idx) => ({ word: w, start: idx * step, end: (idx + 1) * step }));
              onLiveSpeechUpdate({
                transcript: interim,
                word_timestamps: liveWordTs,
                confidence: 96
              });
            }
          };
          try { rec.start(); } catch(e){}
          speechRecognitionRef.current = rec;
        }

        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorderRef.current = new MediaRecorder(stream);
        chunksRef.current = [];
        
        mediaRecorderRef.current.ondataavailable = e => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };
        
        mediaRecorderRef.current.onstop = () => {
          const blob = new Blob(chunksRef.current, { type: 'audio/wav' });
          const file = new File([blob], `mic_recording_${Date.now()}.wav`, { type: 'audio/wav' });
          processFile(file);
          stream.getTracks().forEach(track => track.stop());
        };
        
        mediaRecorderRef.current.start();
        setIsRecording(true);
      } catch (err) {
        console.error("Error accessing microphone:", err);
      }
    }
  };

  const wordTimestamps = currentAnalysis?.word_timestamps || [];
  const fullTranscript = currentAnalysis?.transcript || '';

  // TRULY REAL-TIME YOUTUBE CC SUBTITLES:
  // Words light up INSTANTLY as currentTime reaches start timestamp!
  let spokenWords = wordTimestamps;
  if (isPlaying && wordTimestamps.length > 0) {
    spokenWords = wordTimestamps.filter(w => currentTime >= w.start);
    if (spokenWords.length > 8) {
      spokenWords = spokenWords.slice(-8);
    }
  }

  return (
    <div className="card" style={{ gridRow: 'span 2' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h2 style={{ fontSize: '15px', fontWeight: '700', letterSpacing: '1.5px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          LIVE RADIO
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div className={isPlaying || isRecording ? 'pulse' : ''} style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: isPlaying || isRecording ? 'var(--accent-red)' : 'var(--text-secondary)' }}></div>
          <span style={{ fontSize: '11px', color: isPlaying || isRecording ? 'var(--accent-red)' : 'var(--text-secondary)', fontWeight: 'bold' }}>
            {isRecording ? 'RECORDING LIVE' : isPlaying ? 'PLAYING LIVE' : 'IDLE'}
          </span>
        </div>
      </div>

      {/* Dropzone */}
      <div 
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleFileDrop}
        onClick={() => fileInputRef.current && fileInputRef.current.click()}
        style={{
          border: `2px dashed ${isDragging ? 'var(--accent-red)' : 'var(--border-card)'}`,
          borderRadius: '8px',
          padding: '16px 12px',
          textAlign: 'center',
          cursor: 'pointer',
          marginBottom: '14px',
          background: isDragging ? 'rgba(231, 76, 60, 0.08)' : 'rgba(255,255,255,0.01)',
          transition: 'all 0.2s'
        }}
      >
        <UploadCloud size={22} color="var(--accent-red)" style={{ marginBottom: '4px' }} />
        <div style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: '600' }}>
          Drop audio file or click to upload
        </div>
        <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '2px' }}>
          Supports WAV, MP3, OGG, WebM
        </div>
      </div>
      
      <input type="file" ref={fileInputRef} onChange={handleFileInput} accept="audio/*" style={{ display: 'none' }} />
      <audio
        ref={audioRef}
        crossOrigin="anonymous"
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleAudioEnded}
        style={{ display: 'none' }}
      />

      {/* Real F1 Radio Library (OpenF1) */}
      {clips.length > 0 && (
        <div style={{ marginBottom: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <h3 style={{ fontSize: '11px', color: 'var(--accent-teal)', letterSpacing: '1px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Radio size={13} /> REAL TEAM RADIO
            </h3>
            {sessions.length > 1 ? (
              <div style={{ display: 'flex', gap: '4px' }}>
                {sessions.map(s => (
                  <button
                    key={s.key}
                    onClick={() => setActiveSession(s.key)}
                    style={{
                      fontSize: '10px', fontWeight: 'bold', letterSpacing: '0.5px',
                      padding: '3px 10px', borderRadius: '10px', cursor: 'pointer',
                      background: s.key === currentSession ? 'rgba(26, 188, 156, 0.15)' : 'transparent',
                      color: s.key === currentSession ? 'var(--accent-teal)' : 'var(--text-secondary)',
                      border: `1px solid ${s.key === currentSession ? 'rgba(26, 188, 156, 0.5)' : 'var(--border-card)'}`
                    }}
                  >
                    {shortLabel(s.label)}
                  </button>
                ))}
              </div>
            ) : sessionLabel ? (
              <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>{sessionLabel}</span>
            ) : null}
          </div>
          <div style={{ maxHeight: '132px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {visibleClips.map((clip) => (
              <div
                key={clip.id}
                onClick={() => playClip(clip)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  padding: '6px 8px', borderRadius: '6px', cursor: 'pointer',
                  background: activeClipId === clip.id ? 'rgba(26, 188, 156, 0.12)' : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${activeClipId === clip.id ? 'rgba(26, 188, 156, 0.5)' : 'var(--border-card)'}`,
                  transition: 'all 0.15s'
                }}
              >
                <Play size={12} color="var(--accent-teal)" fill={activeClipId === clip.id ? 'var(--accent-teal)' : 'none'} />
                <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-primary)', minWidth: '34px' }}>
                  {clip.driver}
                </span>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)', flex: 1 }}>
                  {clip.lap_number ? `Lap ${clip.lap_number}` : 'Radio'}
                  {clip.synthetic ? ' · synthetic' : ''}
                </span>
                {clip.lap_duration && (
                  <span className="mono" style={{ fontSize: '10px', color: 'var(--accent-teal)' }}>
                    {formatLapTime(clip.lap_duration)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* Visualizer Player */}
      <div style={{ background: 'var(--bg-dark)', borderRadius: '8px', padding: '12px', marginBottom: '14px', border: '1px solid var(--border-card)' }}>
        <canvas ref={canvasRef} width={300} height={45} style={{ width: '100%', height: '45px', marginBottom: '10px', display: 'block' }}></canvas>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <button style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }} onClick={() => { if(audioRef.current) audioRef.current.currentTime -= 5; }}><Rewind size={16} /></button>
            <button style={{ background: 'var(--accent-red)', border: 'none', color: '#fff', width: '34px', height: '34px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }} onClick={handlePlayPause}>
              {isPlaying ? <Pause size={16} /> : <Play size={16} fill="currentColor" style={{ marginLeft: 2 }} />}
            </button>
            <button style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }} onClick={() => { if(audioRef.current) audioRef.current.currentTime += 5; }}><FastForward size={16} /></button>
          </div>
          
          <div className="mono" style={{ fontSize: '12px', color: 'var(--text-primary)', fontWeight: 'bold' }}>
            {formatTime(currentTime)} / {formatTime(duration)}
          </div>
          
          <button style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }} onClick={() => { if(audioRef.current) audioRef.current.currentTime = 0; }}><Repeat size={15} /></button>
        </div>
      </div>
      
      {/* YouTube Style Real-Time Subtitles Box */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          <h3 style={{ fontSize: '11px', color: 'var(--accent-yellow)', letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'bold' }}>
            <Subtitles size={14} color="var(--accent-yellow)" /> LIVE SUBTITLES (YouTube CC Mode)
          </h3>
          {currentAnalysis?.confidence && (
            <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
              Confidence: <span style={{ color: 'var(--accent-teal)', fontWeight: 'bold' }}>{currentAnalysis.confidence}%</span>
            </span>
          )}
        </div>
        
        {/* Subtitle Container */}
        <div 
          style={{ 
            flex: 1, 
            background: 'rgba(0,0,0,0.95)', 
            borderRadius: '8px', 
            padding: '16px', 
            border: '1px solid rgba(241, 196, 15, 0.4)', 
            minHeight: '90px',
            maxHeight: '110px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexWrap: 'wrap',
            gap: '8px',
            boxShadow: '0 0 20px rgba(0,0,0,0.9), inset 0 0 10px rgba(241, 196, 15, 0.05)',
            overflow: 'hidden'
          }}
        >
          {spokenWords && spokenWords.length > 0 ? (
            spokenWords.map((item, idx) => {
              const isLastSpoken = idx === spokenWords.length - 1;
              const isActive = isPlaying && (isLastSpoken || (currentTime >= item.start && currentTime <= item.end));

              return (
                <span 
                  key={idx}
                  style={{
                    fontSize: isActive ? '16px' : '14px',
                    fontWeight: isActive ? '900' : '600',
                    color: isActive ? '#f1c40f' : '#ffffff',
                    background: isActive ? 'rgba(241, 196, 15, 0.3)' : 'transparent',
                    padding: '3px 8px',
                    borderRadius: '4px',
                    border: isActive ? '1px solid var(--accent-yellow)' : '1px solid transparent',
                    transition: 'all 0.1s ease-out',
                    transform: isActive ? 'scale(1.08)' : 'scale(1.0)',
                    textShadow: isActive ? '0 0 10px rgba(241, 196, 15, 0.8)' : 'none',
                    letterSpacing: '0.4px',
                    display: 'inline-block'
                  }}
                >
                  {item.word}
                </span>
              );
            })
          ) : fullTranscript ? (
            <span style={{ color: '#ffffff', fontSize: '14px', fontWeight: '600' }}>
              "{fullTranscript}"
            </span>
          ) : (
            <span style={{ color: 'var(--text-secondary)', fontSize: '13px', fontStyle: 'italic' }}>
              {currentAnalysis?.analyzing ? 'Transcribing with Whisper…' : 'Awaiting transmission... Subtitles light up live as speech audio plays'}
            </span>
          )}
        </div>
      </div>
      
      {/* Push-to-Talk Mic */}
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: '14px' }}>
        <button 
          onClick={toggleRecording}
          className={isRecording ? 'pulse' : ''}
          style={{
            width: '52px',
            height: '52px',
            borderRadius: '50%',
            background: isRecording ? 'var(--accent-red)' : 'rgba(231, 76, 60, 0.1)',
            border: `2px solid var(--accent-red)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'all 0.2s',
            color: isRecording ? '#fff' : 'var(--accent-red)'
          }}
          title={isRecording ? "Stop Recording" : "Push to Talk"}
        >
          <Mic size={22} />
        </button>
      </div>
    </div>
  );
};

export default LiveRadio;
