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
    
    // Build severity text with damage classification
    var sevText = 'Severity: ' + (data && data.severity ? data.severity : 'Unknown');
    if(data && data.damaged_frames !== undefined) {
      sevText += ' | Damaged Frames: ' + data.damaged_frames + '/' + (data.total_frames||0);
    }
    
    // Add damage classification if available
    if(data && data.damage_details) {
      var dd = data.damage_details;
      if(dd.category && dd.category !== 'None') {
        sevText += ' | Type: ' + dd.category;
      }
      if(dd.repair_urgency && dd.repair_urgency !== 'None') {
        sevText += ' | Urgency: ' + dd.repair_urgency;
      }
    }
    
    var sevEl = document.getElementById(prefix+'Sev');
    if(sevEl) sevEl.textContent = sevText;
    
    // Add damage description if available
    if(data && data.damage_details && data.damage_details.description) {
      var descEl = document.getElementById(prefix+'Desc');
      if(descEl) {
        descEl.textContent = data.damage_details.description;
        descEl.style.display = 'block';
      }
    }
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

// ==================== BATCH PROCESSING ====================
var batchFiles = [];
var batchResultsData = [];

// File input listener for batch - ATTACH IMMEDIATELY
document.addEventListener('DOMContentLoaded', function() {
  console.log('Setting up batch processing...');
  
  // Click handler for upload area
  var uploadArea = document.getElementById('batchUploadArea');
  var batchInput = document.getElementById('batchFiles');
  
  if(uploadArea && batchInput) {
    uploadArea.style.cursor = 'pointer';
    uploadArea.addEventListener('click', function() {
      console.log('Upload area clicked');
      batchInput.click();
    });
    
    // Add hover effects
    uploadArea.addEventListener('mouseenter', function() {
      this.style.borderColor = '#3fb950';
      this.style.transform = 'scale(1.01)';
    });
    uploadArea.addEventListener('mouseleave', function() {
      this.style.borderColor = '#58a6ff';
      this.style.transform = 'scale(1)';
    });
    
    batchInput.addEventListener('change', function(e) {
      console.log('Files selected:', e.target.files.length);
      var files = Array.from(e.target.files);
      if(files.length > 10) {
        alert('Maximum 10 files allowed. Only first 10 will be processed.');
        files = files.slice(0, 10);
      }
      batchFiles = files;
      displayBatchFileList();
    });
  } else {
    console.warn('Batch elements not found:', {uploadArea: !!uploadArea, batchInput: !!batchInput});
  }
});

function displayBatchFileList() {
  var listDiv = document.getElementById('batchFileList');
  var btn = document.getElementById('batchAnalyzeBtn');
  
  if(!listDiv || !btn) {
    console.error('Batch elements not found in displayBatchFileList');
    return;
  }
  
  if(batchFiles.length === 0) {
    listDiv.innerHTML = '';
    listDiv.style.display = 'none';
    btn.disabled = true;
    return;
  }
  
  // Show the list div with light theme to match site
  listDiv.style.display = 'block';
  listDiv.style.background = '#f6f8fa';
  listDiv.style.border = '1px solid #d0d7de';
  
  var html = '<div style="padding: 10px; background: white; border-radius: 6px;">';
  html += '<strong style="color: #24292f;">Selected Files (' + batchFiles.length + '):</strong><br>';
  batchFiles.forEach(function(f, i) {
    var icon = f.type && f.type.startsWith('video') ? '🎥' : '📷';
    var size = (f.size / 1024 / 1024).toFixed(2);
    html += '<div style="padding: 5px 0; color: #57606a; font-size: 0.9rem;">';
    html += icon + ' ' + (i+1) + '. ' + f.name + ' <span style="color: #8b949e;">(' + size + ' MB)</span>';
    html += '</div>';
  });
  html += '</div>';
  
  listDiv.innerHTML = html;
  btn.disabled = false;
  console.log('File list displayed with', batchFiles.length, 'files');
}

function clearBatch() {
  batchFiles = [];
  var fileInput = document.getElementById('batchFiles');
  var fileList = document.getElementById('batchFileList');
  var btn = document.getElementById('batchAnalyzeBtn');
  var results = document.getElementById('batchResults');
  var load = document.getElementById('batchLoad');
  
  if(fileInput) fileInput.value = '';
  if(fileList) {
    fileList.innerHTML = '';
    fileList.style.display = 'none';
  }
  if(btn) btn.disabled = true;
  if(results) results.style.display = 'none';
  if(load) load.style.display = 'none';
}

function analyzeBatch() {
  if(batchFiles.length === 0) {
    alert('Please select files first');
    return;
  }
  
  var btn = document.getElementById('batchAnalyzeBtn');
  var loadDiv = document.getElementById('batchLoad');
  var progressP = document.getElementById('batchProgress');
  
  btn.disabled = true;
  btn.textContent = 'Processing...';
  loadDiv.style.display = 'flex';
  progressP.textContent = 'Uploading ' + batchFiles.length + ' files...';
  
  var formData = new FormData();
  batchFiles.forEach(function(f) {
    formData.append('files', f);
  });
  
  fetch('/predict_batch', {
    method: 'POST',
    body: formData
  })
  .then(function(r) { return r.json(); })
  .then(function(data) {
    loadDiv.style.display = 'none';
    btn.textContent = 'Analyze All Files';
    btn.disabled = false;
    
    if(data.error) {
      alert('Error: ' + data.error);
      return;
    }
    
    batchResultsData = data.results || [];
    displayBatchResults(data);
  })
  .catch(function(err) {
    loadDiv.style.display = 'none';
    btn.textContent = 'Analyze All Files';
    btn.disabled = false;
    console.error('Batch error:', err);
    alert('Failed to process batch. Check console for details.');
  });
}

function displayBatchResults(data) {
  var resultsDiv = document.getElementById('batchResults');
  var summaryDiv = document.getElementById('batchSummary');
  var listDiv = document.getElementById('batchResultsList');
  
  resultsDiv.style.display = 'block';
  
  // Calculate summary stats
  var total = data.total_files || 0;
  var damaged = 0;
  var good = 0;
  var errors = 0;
  var potholeCount = 0;
  var crackCount = 0;
  
  data.results.forEach(function(r) {
    if(r.error) {
      errors++;
    } else if(r.result && r.result.includes('Damage')) {
      damaged++;
      if(r.damage_type === 'Major Damage' || r.damage_type === 'Pothole/Crack') {
        potholeCount++;
      } else if(r.damage_type === 'Moderate Damage' || r.damage_type === 'Surface Crack') {
        crackCount++;
      }
    } else {
      good++;
    }
  });
  
  // Display summary
  var summaryHtml = '<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 15px;">';
  summaryHtml += '<div style="text-align: center; padding: 10px; background: white; border-radius: 6px; border-left: 4px solid #0969da;"><div style="font-size: 1.5rem; font-weight: 600;">' + total + '</div><div style="font-size: 0.8rem; color: #57606a;">Total Files</div></div>';
  summaryHtml += '<div style="text-align: center; padding: 10px; background: white; border-radius: 6px; border-left: 4px solid #d1242f;"><div style="font-size: 1.5rem; font-weight: 600;">' + damaged + '</div><div style="font-size: 0.8rem; color: #57606a;">Damaged</div></div>';
  summaryHtml += '<div style="text-align: center; padding: 10px; background: white; border-radius: 6px; border-left: 4px solid #1a7f37;"><div style="font-size: 1.5rem; font-weight: 600;">' + good + '</div><div style="font-size: 0.8rem; color: #57606a;">Good Roads</div></div>';
  summaryHtml += '<div style="text-align: center; padding: 10px; background: white; border-radius: 6px; border-left: 4px solid #fb8500;"><div style="font-size: 1.5rem; font-weight: 600;">' + potholeCount + '</div><div style="font-size: 0.8rem; color: #57606a;">Potholes</div></div>';
  summaryHtml += '<div style="text-align: center; padding: 10px; background: white; border-radius: 6px; border-left: 4px solid #9a6700;"><div style="font-size: 1.5rem; font-weight: 600;">' + crackCount + '</div><div style="font-size: 0.8rem; color: #57606a;">Cracks</div></div>';
  summaryHtml += '</div>';
  
  if(errors > 0) {
    summaryHtml += '<div style="margin-top: 10px; padding: 8px; background: #ffebe9; color: #d1242f; border-radius: 4px; font-size: 0.85rem;">';
    summaryHtml += '⚠️ ' + errors + ' file(s) could not be processed';
    summaryHtml += '</div>';
  }
  
  summaryDiv.innerHTML = summaryHtml;
  
  // Display individual results
  var listHtml = '';
  data.results.forEach(function(r, i) {
    if(r.error) {
      listHtml += '<div style="padding: 12px; margin-bottom: 10px; background: #ffebe9; border-radius: 6px; border-left: 4px solid #d1242f;">';
      listHtml += '<div style="font-weight: 500;">' + (i+1) + '. ' + r.filename + '</div>';
      listHtml += '<div style="color: #d1242f; font-size: 0.85rem;">Error: ' + r.error + '</div>';
      listHtml += '</div>';
    } else {
      var color = r.color === 'red' ? '#d1242f' : '#1a7f37';
      var icon = r.type === 'video' ? '🎥' : '📷';
      
      listHtml += '<div style="padding: 12px; margin-bottom: 10px; background: white; border: 1px solid #d0d7de; border-radius: 6px; border-left: 4px solid ' + color + ';">';
      listHtml += '<div style="display: flex; justify-content: space-between; align-items: center;">';
      listHtml += '<div style="font-weight: 500;">' + icon + ' ' + (i+1) + '. ' + r.filename + '</div>';
      listHtml += '<div style="font-weight: 600; color: ' + color + ';">' + r.confidence + '%</div>';
      listHtml += '</div>';
      listHtml += '<div style="margin-top: 8px; color: ' + color + '; font-weight: 500;">' + r.result + '</div>';
      if(r.damage_details) {
        listHtml += '<div style="margin-top: 5px; font-size: 0.85rem; color: #57606a;">';
        listHtml += '<span style="background: #f6f8fa; padding: 2px 6px; border-radius: 4px;">' + r.damage_details.category + '</span>';
        listHtml += ' • ' + r.damage_details.repair_urgency + ' Priority';
        listHtml += '</div>';
      }
      listHtml += '</div>';
    }
  });
  
  listDiv.innerHTML = listHtml;
}

function exportBatchResults() {
  if(batchResultsData.length === 0) {
    alert('No results to export');
    return;
  }
  
  var rows = [];
  rows.push(['#','Filename','Type','Result','Confidence(%)','Damage Type','Category','Repair Urgency','Severity']);
  
  batchResultsData.forEach(function(r, i) {
    if(!r.error) {
      rows.push([
        i+1,
        r.filename,
        r.type,
        r.result,
        r.confidence,
        r.damage_type,
        r.damage_details ? r.damage_details.category : '',
        r.damage_details ? r.damage_details.repair_urgency : '',
        r.severity
      ]);
    }
  });
  
  var csv = rows.map(function(row) {
    return row.map(function(c) { return '"' + String(c).replace(/"/g,'""') + '"'; }).join(',');
  }).join('\n');
  
  var blob = new Blob([csv], {type: 'text/csv;charset=utf-8;'});
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'batch_results_' + new Date().toISOString().slice(0,10) + '.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
