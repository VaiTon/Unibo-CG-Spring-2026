"use strict";

///////////////////////////////////
// GENERAL MATH FUNCTIONS
///////////////////////////////////

function calculateBezierCurve(controlPoints) {
  // De Casteljau's algorithm for cubic Bezier curve
  const steps = 100;

  const beizierPoints = [];
  for (let t = 0; t <= 1; t += 1 / steps) {
    const x =
      Math.pow(1 - t, 3) * controlPoints[0].x +
      3 * Math.pow(1 - t, 2) * t * controlPoints[1].x +
      3 * (1 - t) * Math.pow(t, 2) * controlPoints[2].x +
      Math.pow(t, 3) * controlPoints[3].x;

    const y =
      Math.pow(1 - t, 3) * controlPoints[0].y +
      3 * Math.pow(1 - t, 2) * t * controlPoints[1].y +
      3 * (1 - t) * Math.pow(t, 2) * controlPoints[2].y +
      Math.pow(t, 3) * controlPoints[3].y;

    beizierPoints.push({ x, y });
  }

  return beizierPoints;
}

///////////////////////////////////
// STATELESS VIEWPORT-WINDOW TRANSFORMATIONS
///////////////////////////////////

function window2viewport(px, py, scx, scy, view, win, angle) {
  const ixp = Math.round(scx * (px - win.xmin) + view.xmin);
  const iyp = Math.round(scy * (win.ymin - py) + view.ymax);
  if (angle === 0) {
    return { ixp, iyp };
  }

  // rotation
  const centerX = (win.xmin + win.xmax) / 2;
  const centerY = (win.ymin + win.ymax) / 2;

  const cosA = Math.cos(-angle);
  const sinA = Math.sin(-angle);

  const rotatedX = cosA * (ixp - centerX) - sinA * (iyp - centerY) + centerX;
  const rotatedY = sinA * (ixp - centerX) + cosA * (iyp - centerY) + centerY;

  return { ixp: Math.round(rotatedX), iyp: Math.round(rotatedY) };
}

function viewport2window(ixp, iyp, scx, scy, view, win, angle) {
  let rotatedX = ixp;
  let rotatedY = iyp;

  if (angle !== 0) {
    const centerX = (win.xmin + win.xmax) / 2;
    const centerY = (win.ymin + win.ymax) / 2;

    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);

    rotatedX = cosA * (ixp - centerX) - sinA * (iyp - centerY) + centerX;
    rotatedY = sinA * (ixp - centerX) + cosA * (iyp - centerY) + centerY;
  }

  const px = (rotatedX - view.xmin) / scx + win.xmin;
  const py = win.ymin - (rotatedY - view.ymax) / scy;

  return { px, py };
}

///////////////////////////////////
// STATIC DATA AND STATE
///////////////////////////////////

// HTML elements and rendering context
let canvas, ctx;

// Viewport and window definitions
let view = { xmin: 0, xmax: 0, ymin: 0, ymax: 0 };
let win = { xmin: -1.0, xmax: 1.0, ymin: -1.0, ymax: 1.0 };
let angle = 0; // rotation angle in radians
let scx, scy; // scaling factors

// Control points and Bezier curve points
const MAX_CONTROL_POINTS = 4;

let controlPoints = [];
let beizierPoints = [];

///////////////////////////////////
// CAMERA TRANSFORMATIONS
///////////////////////////////////

function updateScalingFactors() {
  scx = (view.xmax - view.xmin) / (win.xmax - win.xmin);
  scy = (view.ymax - view.ymin) / (win.ymax - win.ymin);
}

function zoom(center, factor) {
  const newWidth = (win.xmax - win.xmin) * factor;
  const newHeight = (win.ymax - win.ymin) * factor;

  const pctX = (center.px - win.xmin) / (win.xmax - win.xmin);
  const pctY = (center.py - win.ymin) / (win.ymax - win.ymin);

  win.xmin = center.px - newWidth * pctX;
  win.xmax = win.xmin + newWidth;
  win.ymin = center.py - newHeight * pctY;
  win.ymax = win.ymin + newHeight;

  updateScalingFactors();
}

function pan(deltaX, deltaY) {
  win.xmin += deltaX;
  win.xmax += deltaX;
  win.ymin += deltaY;
  win.ymax += deltaY;

  updateScalingFactors();
}

function zoomToFit(points) {
  if (points.length === 0) return;

  let [minX, maxX] = [points[0].x, points[0].x];
  let [minY, maxY] = [points[0].y, points[0].y];

  for (const pt of points) {
    if (pt.x < minX) minX = pt.x;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.y < minY) minY = pt.y;
    if (pt.y > maxY) maxY = pt.y;
  }

  const padding = 0.1; // 10% padding around the points

  const xPadding = (maxX - minX) * padding;
  const yPadding = (maxY - minY) * padding;

  win = {
    xmin: minX - xPadding,
    xmax: maxX + xPadding,
    ymin: minY - yPadding,
    ymax: maxY + yPadding,
  };

  updateScalingFactors();
  render();
}

///////////////////////////////////
// INITIALIZATION AND RENDERING
///////////////////////////////////

function init() {
  canvas = document.getElementById("viewport");
  ctx = canvas.getContext("2d");

  // Initialize viewport and window
  view = { xmin: 0, ymin: 0, xmax: canvas.width, ymax: canvas.height };
  win = { xmin: -1.0, xmax: 1.0, ymin: -1.0, ymax: 1.0 };
  updateScalingFactors();

  // Add event listeners
  canvas.addEventListener("mouseup", onMouseUp);
  canvas.addEventListener("mousedown", onMouseDown);
  canvas.addEventListener("mousemove", onMouseMove);
  canvas.addEventListener("wheel", onScroll);
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  const resetButton = document.getElementById("reset");
  resetButton.addEventListener("click", onReset);

  const zoomToFitButton = document.getElementById("zoomToFit");
  zoomToFitButton.addEventListener("click", () => zoomToFit(controlPoints));
}

function render() {
  const drawControlPoint = (point) => {
    ctx.fillStyle = "red";
    ctx.beginPath();
    ctx.arc(point.ixp, point.iyp, 5, 0, 2 * Math.PI);
    ctx.fill();
  };

  const drawBezierCurve = (points) => {
    if (points.length < 1) return;
    ctx.strokeStyle = "blue";
    ctx.lineWidth = 2;
    ctx.beginPath();

    ctx.moveTo(points[0].ixp, points[0].iyp);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].ixp, points[i].iyp);
    }
    ctx.stroke();
  };

  // Clear the canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw control points
  for (const point of controlPoints) {
    const viewportPos = window2viewport(
      point.x,
      point.y,
      scx,
      scy,
      view,
      win,
      angle,
    );
    drawControlPoint(viewportPos);
  }

  if (beizierPoints.length > 0) {
    const viewportBezierPoints = beizierPoints.map((pt) =>
      window2viewport(pt.x, pt.y, scx, scy, view, win, angle),
    );
    drawBezierCurve(viewportBezierPoints);
  }
}

document.addEventListener("DOMContentLoaded", init);

///////////////////////////////////
// EVENT HANDLERS
///////////////////////////////////
let lastMousePos = null;

function onMouseDown(event) {
  if (event.button === 2) {
    event.preventDefault();
    lastMousePos = { x: event.clientX, y: event.clientY };
  }
}

function onMouseMove(event) {
  if (event.buttons === 2) {
    // movement since last frame
    const deltaX = event.clientX - lastMousePos.x;
    const deltaY = event.clientY - lastMousePos.y;

    const worldDeltaX = -deltaX / scx;
    const worldDeltaY = deltaY / scy;

    // update last mouse position for next movement
    lastMousePos = { x: event.clientX, y: event.clientY };

    pan(worldDeltaX, worldDeltaY);
    render();
  }
}

function onMouseUp(event) {
  if (event.button === 2) {
    lastMousePos = null;
  } else if (event.button === 0) {
    // left-click, add control point

    const rect = canvas.getBoundingClientRect();
    const ixp = event.clientX - rect.left;
    const iyp = event.clientY - rect.top;

    const pos = viewport2window(ixp, iyp, scx, scy, view, win, angle);
    console.log(
      `Viewport: (${event.clientX}, ${event.clientY}) -> Window: (${pos.px.toFixed(2)}, ${pos.py.toFixed(2)})`,
    );

    // Add control point
    if (controlPoints.length < MAX_CONTROL_POINTS) {
      const point = { x: pos.px, y: pos.py };
      controlPoints.push(point);
      console.log(
        `Control point ${controlPoints.length} added: (${pos.px.toFixed(2)}, ${pos.py.toFixed(2)})`,
      );
    }

    // Once we have enough control points, draw the Bezier curve
    if (controlPoints.length === 4) {
      console.log("4 control points collected. Drawing Bezier curve...");
      beizierPoints = calculateBezierCurve(controlPoints);
    }
  }

  render();
}

function onReset() {
  controlPoints = [];
  beizierPoints = [];
  render();

  console.log("Canvas reset. Control points cleared.");
}

function onScroll(event) {
  event.preventDefault();

  const rect = canvas.getBoundingClientRect();
  const mouseX = event.clientX - rect.left;
  const mouseY = event.clientY - rect.top;
  const mouseWorld = viewport2window(
    mouseX,
    mouseY,
    scx,
    scy,
    view,
    win,
    angle,
  );

  const zoomFactor = event.deltaY < 0 ? 0.9 : 1.1;
  zoom(mouseWorld, zoomFactor);
  render();
}
