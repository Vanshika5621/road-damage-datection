function showTab(tab, el) {
  stopCamera();
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  el.classList.add('active');
  document.getElementById(tab+'Section').classList.add('active');
}

document.getElementById('fi').onchange = function(e) {
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

function showResult(prefix, data) {
  var rb = document.getElementById(prefix+'Result');
  rb.style.display = 'block';
  var isDamaged = data.color === 'red';
  rb.className = 'result-card ' + (isDamaged ? 'damaged' : 'good');
  document.getElementById(prefix+'ResultIcon').textContent = isDamaged ? '🔴' : '🟢';
  document.getElementById(prefix+'ResultText').textContent = data.result;
  document.getElementById(prefix+'DamageType').textContent = 'Type: ' + data.damage_type;
  document.getElementById(prefix+'Conf').textContent = data.confidence + '%';
  var fill = document.getElementById(prefix+'Progress');
  fill.style.width = '0%';
  setTimeout(function(){ fill.style.width = data.confidence + '%'; }, 100);
  fill.style.background = isDamaged ?
    'linear-gradient(90deg,#da3633,#f85149)' :
    'linear-gradient(90deg,#238636,#3fb950)';
  var sevText = 'Severity: ' + data.severity;
  if(data.damaged_frames !== undefined) {
    sevText += ' | Damaged Frames: ' + data.damaged_frames + '/' + data.total_frames;
  }
  document.getElementById(prefix+'Sev').textContent = sevText;
}

function detectImage() {
  var f = document.getElementById('fi');
  if(!f.files[0]) { alert('Please select an image!'); return; }
  document.getElementById('imgLoad').style.display = 'block';
  document.getElementById('imgResult').style.display = 'none';
  var fd = new FormData();
  fd.append('file', f.files[0]);
  fetch('/predict', {method:'POST', body:fd})
  .then(r => r.json())
  .then(d => {
    document.getElementById('imgLoad').style.display = 'none';
    showResult('img', d);
  });
}

var cameraRunning = false;
function startCamera() {
  cameraRunning = true;
  var feed = document.getElementById('videoFeed');
  document.getElementById('camPlaceholder').style.display = 'none';
  feed.src = '/video_feed';
  feed.style.display = 'block';
  document.getElementById('startBtn').style.display = 'none';
  document.getElementById('stopBtn').style.display = 'block';
}

function stopCamera() {
  if(cameraRunning) {
    fetch('/stop_camera', {method:'POST'});
    cameraRunning = false;
  }
  var feed = document.getElementById('videoFeed');
  feed.src = '';
  feed.style.display = 'none';
  document.getElementById('camPlaceholder').style.display = 'flex';
  document.getElementById('startBtn').style.display = 'block';
  document.getElementById('stopBtn').style.display = 'none';
}

document.getElementById('vi').onchange = function(e) {
  var f = e.target.files[0];
  if(f) {
    var vp = document.getElementById('vidPreview');
    vp.src = URL.createObjectURL(f);
    vp.style.display = 'block';
  }
};

function detectVideo() {
  var f = document.getElementById('vi');
  if(!f.files[0]) { alert('Please select a video!'); return; }
  document.getElementById('vidLoad').style.display = 'block';
  document.getElementById('vidResult').style.display = 'none';
  var fd = new FormData();
  fd.append('file', f.files[0]);
  fetch('/predict_video', {method:'POST', body:fd})
  .then(r => r.json())
  .then(d => {
    document.getElementById('vidLoad').style.display = 'none';
    showResult('vid', d);
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
  fetch('/stats')
  .then(r => r.json())
  .then(data => {
    drawDonut(data.damaged, data.good);
    if(data.trend && data.trend.length > 0) drawTrend(data.trend);
    else drawTrend([
      {time:'10:00',conf:94},{time:'11:00',conf:12},{time:'12:00',conf:87},
      {time:'13:00',conf:96},{time:'14:00',conf:9},{time:'15:00',conf:78}
    ]);
    document.getElementById('donutLabel').innerHTML =
      '<div style="font-size:1.4rem;font-weight:800;color:#e6edf3">'+(data.total||5)+'</div><div style="font-size:0.75rem;color:#8b949e">Total</div>';
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
