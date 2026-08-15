import React, { useRef, useState } from 'react';
import { UploadCloud, Mic } from 'lucide-react';

// Minimal upload + mic capture. Sends audio to the backend; result appears in the analysis panel.
const UploadZone = ({ onAudioUpload }) => {
  const fileInputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const [recording, setRecording] = useState(false);

  const toggleRecording = async () => {
    if (recording) {
      mediaRecorderRef.current?.stop();
      setRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      chunksRef.current = [];
      mediaRecorderRef.current.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mediaRecorderRef.current.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        onAudioUpload(new File([blob], `mic_${Date.now()}.webm`, { type: 'audio/webm' }));
        stream.getTracks().forEach(t => t.stop());
      };
      mediaRecorderRef.current.start();
      setRecording(true);
    } catch (err) {
      console.error('Mic error:', err);
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
      <div
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files?.[0]) onAudioUpload(e.dataTransfer.files[0]); }}
        style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 12px', border: '1px dashed var(--border-card)', borderRadius: '8px', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '11px' }}
        title="Analyze your own radio clip"
      >
        <UploadCloud size={14} color="var(--accent-red)" /> Your own clip
      </div>
      <input type="file" ref={fileInputRef} accept="audio/*" style={{ display: 'none' }}
        onChange={(e) => { if (e.target.files?.[0]) onAudioUpload(e.target.files[0]); e.target.value = ''; }} />
      <button
        onClick={toggleRecording}
        className={recording ? 'pulse' : ''}
        title={recording ? 'Stop recording' : 'Record from mic'}
        style={{ width: '34px', height: '34px', borderRadius: '50%', background: recording ? 'var(--accent-red)' : 'rgba(231,76,60,0.1)', border: '1.5px solid var(--accent-red)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: recording ? '#fff' : 'var(--accent-red)' }}
      >
        <Mic size={15} />
      </button>
    </div>
  );
};

export default UploadZone;
