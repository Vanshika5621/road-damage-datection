f = open("templates/index.html", "w")
f.write("""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Road Damage Detection</title>
<link rel="stylesheet" href="/static/css/style.css">
</head>
<body>
<nav class="navbar">
  <div class="nav-left">
    <div class="nav-logo">RDD</div>
    <div>
      <div class="nav-title">Road Damage Detection</div>
      <div class="nav-sub">Deep Learning System</div>
    </div>
  </div>
  <div class="nav-right">
    <span class="badge-live">LIVE</span>
    <span class="nav-info">AKS University | Vanshika Soni</span>
  </div>
</nav>

<div class="hero">
  <div class="hero-content">
    <h2>AI-Powered Road <span class="highlight">Damage Detection</span></h2>
    <p>Using Convolutional Neural Network (CNN) + TensorFlow + Fast