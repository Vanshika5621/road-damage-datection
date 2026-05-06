console.log('main.js loaded');

function showTab(tab, el) {
  stopCamera();
  document.querySelectorAll('.tab, .nav-list li').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  if(el && el.classList) el.classList.add('active');
  var sec = document.getElementById(tab+'Section');
  if(sec) sec.classList.add('active');
  // Smoothly scroll the activated section into view so the user sees it immediately
  try {
    if(sec && typeof sec.scrollIntoView === 'function') {
      // small timeout to allow layout changes to apply
      setTimeout(function(){
        var navbar = document.querySelector('.navbar');
        var offset = 0;
        if(navbar) offset = navbar.getBoundingClientRect().height + 8;
        var top = sec.getBoundingClientRect().top + window.scrollY - offset;
        window.scrollTo({ top: top, behavior: 'smooth' });
      }, 80);
    }
  } catch (err) {
    console.error('Error scrolling section into view', err);
  }
}

var fiElTop = document.getElementById('fi');
if(fiElTop) {
  fiElTop.onchange = function(e) {
  var f = e.target.files[0];
  if(f) {
    var r = new FileReader();
    r.onload = function(e) {
      var p = document.getElementById('preview');
      p.src = e.target.result;
      p.style.display = 'block';
    };
    r.readAsDataURL(f);
  }
  };
} else {
  console.warn('file input `fi` not present at top-level');
}

// Attach listeners after DOM ready for nav items and fallback handlers
document.addEventListener('DOMContentLoaded', function() {
  console.log('DOMContentLoaded - attaching listeners');
  // nav-list items
  document.querySelectorAll('.nav-list li').forEach(function(li) {
    li.addEventListener('click', function() {
      var target = li.getAttribute('data-target');
      if(!target) return;
      // mark active and show section
      showTab(target, li);
      if(target === 'history') loadHistory();
    });
  });

  // safe guards for file inputs/buttons that might be missing
  var fi = document.getElementById('fi');
  if(fi) fi.addEventListener('change', function(e){ /* handled above */ });
  var vi = document.getElementById('vi');
  if(vi) vi.addEventListener('change', function(e){ /* handled above */ });
  
  // Refresh button: update graphs and history depending on current view
  var refreshBtn = document.getElementById('refreshBtn');
  if(refreshBtn) refreshBtn.addEventListener('click', function() {
    var btn = this;
    btn.disabled = true;
    btn.textContent = 'Refreshing...';
    
    // if history visible, reload history; always reload stats/graphs
    var active = document.querySelector('.nav-list li.active');
    var target = active ? active.getAttribute('data-target') : 'image';
    
    if(target === 'history') {
      loadHistory();
    } else if(target === 'image') {
      // Reset image section
      document.getElementById('imgResult').style.display = 'none';
      document.getElementById('preview').style.display = 'none';
      document.getElementById('fi').value = '';
    } else if(target === 'video') {
      // Reset video section
      document.getElementById('vidResult').style.display = 'none';
      document.getElementById('vidPreview').style.display = 'none';
      document.getElementById('vi').value = '';
    } else if(target === 'camera') {
      // Restart camera if running
      if(cameraRunning) {
        stopCamera();
        setTimeout(startCamera, 500);
      }
    }
    
    // Try to load graphs if elements exist
    loadGraph();
    
    // Re-enable button after short delay
    setTimeout(function() {
      btn.disabled = false;
      btn.textContent = 'Refresh';
    }, 800);
  });

  // Export CSV: fetch history and download
  var exportBtn = document.getElementById('exportCsvBtn');
  if(exportBtn) exportBtn.addEventListener('click', function() {
    console.log('exportCsvBtn clicked');
    fetch('/history').then(r => r.json()).then(data => {
      if(!data || data.length === 0) { alert('No history to export'); return; }
      var rows = [];
      rows.push(['id','filename','result','confidence','damage_type','severity','type','timestamp']);
      data.forEach(function(d){
        rows.push([d.id, d.filename, d.result, d.confidence, d.damage_type, d.severity, d.type, d.timestamp]);
      });
      var csv = rows.map(r => r.map(c => '"'+String(c).replace(/"/g,'""')+'"').join(',')).join('\n');
      var blob = new Blob([csv], {type: 'text/csv;charset=utf-8;'});
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a'); a.href = url; a.download = 'detection_history.csv'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    }).catch(err => { alert('Failed to export CSV'); });
  });
});

function showResult(prefix, data) {
  try {
    var rb = document.getElementById(prefix+'Result');
    if(!rb) return;
    rb.style.display = 'block';
    var isDamaged = data && data.color === 'red';
    rb.className = 'result-card ' + (isDamaged ? 'damaged' : 'good');
    var titleEl = document.getElementById(prefix+'ResultText');
    if(titleEl && data && data.result) titleEl.textContent = data.result;
    var confEl = document.getElementById(prefix+'Conf');
    if(confEl && data && data.confidence !== undefined) confEl.textContent = data.confidence + '%';
    var fill = document.getElementById(prefix+'Progress');
    if(fill) {
      fill.style.width = '0%';
      setTimeout(function(){ try{ fill.style.width = (data.confidence||0) + '%'; }catch(e){} }, 100);
      fill.style.background = isDamaged ?
        'linear-gradient(90deg,#da3633,#f85149)' :
        'linear-gradient(90deg,#238636,#3fb950)';
    }
    var sevText = 'Severity: ' + (data && data.severity ? data.severity : 'Unknown');
    if(data && data.damaged_frames !== undefined) {
      sevText += ' | Damaged Frames: ' + data.damaged_frames + '/' + (data.total_frames||0);
    }
    var sevEl = document.getElementById(prefix+'Sev');
    if(sevEl) sevEl.textContent = sevText;
  } catch (err) {
    console.error('showResult error', err);
  }
}

function detectImage() {
  console.log('detectImage called');
  var f = document.getElementById('fi');
  if(!f.files[0]) { alert('Please select an image!'); return; }
  document.getElementById('imgLoad').style.display = 'block';
  document.getElementById('imgResult').style.display = 'none';
  var fd = new FormData();
  fd.append('file', f.files[0]);
  fetch('/predict', {method:'POST', body:fd})
  .then(r => {
    if(!r.ok) throw new Error('HTTP '+r.status);
    return r.json();
  })
  .then(d => {
    console.log('Predict response:', d);
    document.getElementById('imgLoad').style.display = 'none';
    showResult('img', d);
  })
  .catch(err => {
    console.error('Predict error:', err);
    document.getElementById('imgLoad').style.display = 'none';
    alert('Analysis failed: '+err.message);
  })
  .finally(() => {
    var btn = document.querySelector('#imageSection .btn-primary');
    if(btn) { btn.disabled = false; btn.textContent = 'Analyze Road Damage'; }
  });
}

var cameraRunning = false;
var localStream = null;
var captureInterval = null;
var lastPredictTime = 0;
var predictMinInterval = 600; // ms between predictions to avoid overload

async function startCamera() {
  console.log('startCamera called');
  cameraRunning = true;
  var startBtn = document.getElementById('startBtn');
  var stopBtn = document.getElementById('stopBtn');
  var localVideo = document.getElementById('localVideo');
  var feed = document.getElementById('videoFeed');

  // Prefer device camera (back-facing) via getUserMedia
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: { ideal: 'environment' } }, 
        audio: false 
      });
      localVideo.srcObject = localStream;
      localVideo.style.display = 'block';
      if (feed) feed.style.display = 'none';

      // Periodically capture frames and send to /predict for live detection (every 600ms with debounce)
      var canvas = document.getElementById('captureCanvas');
      var ctx = canvas.getContext('2d');
      captureInterval = setInterval(async function() {
        try {
          if (!localStream) return;
          var now = Date.now();
          // Only send prediction if enough time has passed since last one
          if (now - lastPredictTime < predictMinInterval) return;
          
          ctx.drawImage(localVideo, 0, 0, canvas.width, canvas.height);
          canvas.toBlob(async function(blob) {
            if (!blob) return;
            lastPredictTime = Date.now();
            var fd = new FormData();
            fd.append('file', blob, 'frame.jpg');
            try {
              const res = await fetch('/predict', { method: 'POST', body: fd });
              if (res.ok) {
                const data = await res.json();
                if (typeof showResult === 'function') showResult('img', data);
              }
            } catch (e) {
              console.error('Frame predict error', e);
            }
          }, 'image/jpeg', 0.6);
        } catch (err) {
          console.error('captureInterval error', err);
        }
      }, 400);

      if (startBtn) { startBtn.style.display = 'none'; startBtn.disabled = false; }
      if (stopBtn) { stopBtn.style.display = 'inline-block'; stopBtn.disabled = false; }
      return;
    } catch (err) {
      console.warn('getUserMedia failed, falling back to server stream', err);
      localStream = null;
    }
  }

  // Fallback: server-side camera stream
  cameraRunning = true;
  if (feed) {
    feed.src = '/video_feed';
    feed.style.display = 'block';
  }
  if (startBtn) { startBtn.style.display = 'none'; startBtn.disabled = false; }
  if (stopBtn) { stopBtn.style.display = 'inline-block'; stopBtn.disabled = false; }
}

function stopCamera() {
  console.log('stopCamera called');
  var startBtn = document.getElementById('startBtn');
  var stopBtn = document.getElementById('stopBtn');
  var localVideo = document.getElementById('localVideo');
  var feed = document.getElementById('videoFeed');

  if (captureInterval) {
    clearInterval(captureInterval);
    captureInterval = null;
  }
  if (localStream) {
    try {
      localStream.getTracks().forEach(t => t.stop());
    } catch (e) { console.error('Error stopping local stream', e); }
    localStream = null;
  }
  if (localVideo) {
    localVideo.srcObject = null;
    localVideo.style.display = 'none';
  }
  if (cameraRunning) {
    fetch('/stop_camera', { method: 'POST' }).catch(e => console.warn('stop_camera call failed', e));
  }
  cameraRunning = false;
  if (feed) { feed.src = ''; feed.style.display = 'none'; }
  if (startBtn) { startBtn.style.display = 'inline-block'; startBtn.disabled = false; }
  if (stopBtn) { stopBtn.style.display = 'none'; stopBtn.disabled = false; }
}

var viEl = document.getElementById('vi');
if(viEl) viEl.onchange = function(e) {
  var f = e.target.files[0];
  if(f) {
    var vp = document.getElementById('vidPreview');
    if(vp) {
      vp.src = URL.createObjectURL(f);
      vp.style.display = 'block';
    }
  }
};
else console.warn('video input `vi` not found');

function detectVideo() {
  console.log('detectVideo called');
  var f = document.getElementById('vi');
  if(!f.files[0]) { alert('Please select a video!'); return; }
  document.getElementById('vidLoad').style.display = 'block';
  document.getElementById('vidResult').style.display = 'none';
  var fd = new FormData();
  fd.append('file', f.files[0]);
  fetch('/predict_video', {method:'POST', body:fd})
  .then(r => {
    if(!r.ok) throw new Error('HTTP '+r.status);
    return r.json();
  })
  .then(d => {
    console.log('Predict video response:', d);
    document.getElementById('vidLoad').style.display = 'none';
    showResult('vid', d);
  })
  .catch(err => {
    console.error('Predict video error:', err);
    document.getElementById('vidLoad').style.display = 'none';
    alert('Video analysis failed: '+err.message);
  })
  .finally(() => {
    var btn = document.querySelector('#videoSection .btn-primary');
    if(btn) { btn.disabled = false; btn.textContent = 'Analyze Video'; }
  });
}

function loadHistory() {
  fetch('/history')
  .then(r => r.json())
  .then(data => {
    if(data.length === 0) {
      var dummy = [
        {filename:'road_sample1.jpg',result:'Road Damage Detected!',confidence:94.2,severity:'High',damage_type:'Pothole',type:'image',timestamp:'2025-04-28 10:23:15'},
        {filename:'highway_test.jpg',result:'Road is Good!',confidence:12.3,severity:'None',damage_type:'No Damage',type:'image',timestamp:'2025-04-28 11:05:42'},
        {filename:'road_video1.mp4',result:'Road Damage Detected!',confidence:87.6,severity:'Medium',damage_type:'Surface Crack',type:'video',timestamp:'2025-04-29 09:14:33'},
        {filename:'city_road.jpg',result:'Road Damage Detected!',confidence:96.1,severity:'High',damage_type:'Pothole',type:'image',timestamp:'2025-04-29 14:22:10'},
        {filename:'smooth_road.jpg',result:'Road is Good!',confidence:8.7,severity:'None',damage_type:'No Damage',type:'image',timestamp:'2025-04-30 16:45:00'},
      ];
      renderHistory(dummy);
    } else {
      renderHistory(data);
    }
  });
}

function renderHistory(data) {
  var html = '<table><tr><th>File</th><th>Result</th><th>Confidence</th><th>Damage Type</th><th>Severity</th><th>Mode</th><th>Time</th></tr>';
  data.forEach(function(d) {
    var isDamaged = d.result.includes('Damage');
    var badge = isDamaged ?
      '<span class="badge badge-red">Damaged</span>' :
      '<span class="badge badge-green">Good</span>';
    html += '<tr><td>'+d.filename+'</td><td>'+badge+'</td><td>'+d.confidence+'%</td><td>'+d.damage_type+'</td><td>'+d.severity+'</td><td>'+d.type+'</td><td>'+d.timestamp+'</td></tr>';
  });
  html += '</table>';
  document.getElementById('historyTable').innerHTML = html;
}

function loadGraph() {
  // Check if chart elements exist
  var donutCanvas = document.getElementById('donutChart');
  var trendCanvas = document.getElementById('trendChart');
  if(!donutCanvas && !trendCanvas) {
    console.log('Chart elements not found, skipping graph load');
    return;
  }
  
  fetch('/stats')
  .then(r => r.json())
  .then(data => {
    try {
      drawDonut(data.damaged, data.good);
      if(data.trend && data.trend.length > 0) drawTrend(data.trend);
      else drawTrend([
        {time:'10:00',conf:94},{time:'11:00',conf:12},{time:'12:00',conf:87},
        {time:'13:00',conf:96},{time:'14:00',conf:9},{time:'15:00',conf:78}
      ]);
      var dl = document.getElementById('donutLabel');
      if(dl) dl.innerHTML = '<div style="font-size:1.4rem;font-weight:800;color:#e6edf3">'+(data.total||5)+'</div><div style="font-size:0.75rem;color:#8b949e">Total</div>';
    } catch(err) {
      console.error('loadGraph error', err);
    }
  })
  .catch(err => {
    console.error('Failed to load stats:', err);
  });
}

function drawDonut(damaged, good) {
  var canvas = document.getElementById('donutChart');
  if(!canvas) return;
  var ctx = canvas.getContext('2d');
  var total = damaged + good || 1;
  var cx = 100, cy = 100, r = 75, w = 22;
  ctx.clearRect(0, 0, 200, 200);
  var slices = [
    {val: damaged/total, color:'#da3633'},
    {val: good/total, color:'#238636'}
  ];
  var start = -Math.PI/2;
  slices.forEach(function(s) {
    var end = start + s.val * 2 * Math.PI;
    ctx.beginPath();
    ctx.arc(cx, cy, r, start, end);
    ctx.arc(cx, cy, r-w, end, start, true);
    ctx.closePath();
    ctx.fillStyle = s.color;
    ctx.fill();
    start = end;
  });
}

function drawTrend(trend) {
  var canvas = document.getElementById('trendChart');
  if(!canvas) return;
  var ctx = canvas.getContext('2d');
  var W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  var pad = 30;
  ctx.strokeStyle = '#21262d';
  ctx.lineWidth = 1;
  for(var i=0;i<5;i++) {
    var y = pad + (H-2*pad)*i/4;
    ctx.beginPath(); ctx.moveTo(pad,y); ctx.lineTo(W-pad,y); ctx.stroke();
  }
  var pts = trend.map(function(d,i) {
    return {
      x: pad + i*(W-2*pad)/(trend.length-1||1),
      y: H - pad - (d.conf/100)*(H-2*pad)
    };
  });
  var grad = ctx.createLinearGradient(0, pad, 0, H-pad);
  grad.addColorStop(0, 'rgba(31,111,235,0.3)');
  grad.addColorStop(1, 'rgba(31,111,235,0)');
  ctx.beginPath();
  pts.forEach(function(p,i){ i===0 ? ctx.moveTo(p.x,p.y) : ctx.lineTo(p.x,p.y); });
  ctx.lineTo(pts[pts.length-1].x, H-pad);
  ctx.lineTo(pts[0].x, H-pad);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.beginPath();
  ctx.strokeStyle = '#1f6feb';
  ctx.lineWidth = 2.5;
  pts.forEach(function(p,i){ i===0 ? ctx.moveTo(p.x,p.y) : ctx.lineTo(p.x,p.y); });
  ctx.stroke();
  pts.forEach(function(p) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI*2);
    ctx.fillStyle = '#58a6ff';
    ctx.fill();
  });
  ctx.fillStyle = '#8b949e';
  ctx.font = '11px Segoe UI';
  trend.forEach(function(d,i) {
    ctx.fillText(d.time, pts[i].x-12, H-8);
  });
}

// Global fallback helpers (called by inline onclick attributes if event listeners fail)
function doRefresh() {
  try {
    var active = document.querySelector('.nav-list li.active');
    if (active && active.getAttribute('data-target') === 'history') {
      if (typeof loadHistory === 'function') loadHistory();
    }
    if (typeof loadGraph === 'function') loadGraph();
  } catch (e) {
    console.error('doRefresh error', e);
  }
}

function doExport() {
  try {
    fetch('/history').then(r => r.json()).then(data => {
      if (!data || data.length === 0) { alert('No history to export'); return; }
      var rows = [];
      rows.push(['id','filename','result','confidence','damage_type','severity','type','timestamp']);
      data.forEach(function(d){ rows.push([d.id, d.filename, d.result, d.confidence, d.damage_type, d.severity, d.type, d.timestamp]); });
      var csv = rows.map(r => r.map(c => '"'+String(c).replace(/"/g,'""')+'"').join(',')).join('\n');
      var blob = new Blob([csv], {type: 'text/csv;charset=utf-8;'});
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a'); a.href = url; a.download = 'detection_history.csv'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    }).catch(err => { alert('Failed to export CSV'); });
  } catch (err) {
    console.error('doExport error', err);
  }
}
