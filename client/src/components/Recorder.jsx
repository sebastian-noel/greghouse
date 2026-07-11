// v1 recorder row: record (5s cap with countdown) / stop / play preview.
// onSave receives the data URL.
import { useEffect, useRef, useState } from 'react';

export default function Recorder({ label, onSave }) {
  const [phase, setPhase] = useState('idle'); // idle | recording | saved | error
  const [status, setStatus] = useState('up to 5 seconds');
  const [count, setCount] = useState('');
  const recRef = useRef(null);
  const urlRef = useRef(null);
  const timersRef = useRef({});

  useEffect(() => () => { // unmount: stop any live recording (v1 closeModal stops it)
    const rec = recRef.current;
    if (rec && rec.state === 'recording') { try { rec.stop(); } catch (e) { /* gone */ } }
    clearTimeout(timersRef.current.cap); clearInterval(timersRef.current.count);
  }, []);

  async function record() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setStatus('mic unavailable — check browser permissions'); setPhase('error'); return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
      const mime = types.find(t => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || '';
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : {});
      recRef.current = rec;
      const chunks = [];
      rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
      rec.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        clearTimeout(timersRef.current.cap); clearInterval(timersRef.current.count);
        const blob = new Blob(chunks, { type: mime || 'audio/webm' });
        const fr = new FileReader();
        fr.onload = () => {
          urlRef.current = fr.result;
          onSave(fr.result);
          setPhase('saved'); setCount('');
          setStatus('saved. tap play to preview, record to redo.');
        };
        fr.readAsDataURL(blob);
      };
      rec.start();
      setPhase('recording'); setStatus('recording...');
      let left = 5; setCount(left + 's');
      timersRef.current.count = setInterval(() => { left--; setCount(Math.max(left, 0) + 's'); }, 1000);
      timersRef.current.cap = setTimeout(() => { if (rec.state === 'recording') rec.stop(); }, 5000);
    } catch (err) {
      setPhase('error');
      setStatus('mic blocked — allow microphone access in your browser settings, then try again');
    }
  }

  function stop() {
    const rec = recRef.current;
    if (rec && rec.state === 'recording') rec.stop();
  }

  function play() {
    if (urlRef.current) { try { new Audio(urlRef.current).play().catch(() => {}); } catch (e) { /* blocked */ } }
  }

  return (
    <div className="recrow">
      <div className="lbl">{label}</div>
      <div className="row">
        {phase !== 'recording'
          ? <button className="small" onClick={record}>record</button>
          : <button className="small" onClick={stop}>stop</button>}
        <button className="small" onClick={play} disabled={phase !== 'saved'}>play</button>
        <span className="count">{count}</span>
      </div>
      <div className="mini">{status}</div>
    </div>
  );
}
