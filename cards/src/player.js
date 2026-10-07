// Custom player controls. Without JavaScript the page falls back to the
// browser's native controls, so the media always plays.
(function () {
  'use strict';

  function fmt(t) {
    if (!isFinite(t) || t < 0) return '--:--';
    var s = Math.floor(t);
    var m = Math.floor(s / 60);
    var h = Math.floor(m / 60);
    var ss = String(s % 60).padStart(2, '0');
    return h ? h + ':' + String(m % 60).padStart(2, '0') + ':' + ss : m + ':' + ss;
  }

  document.querySelectorAll('[data-player]').forEach(function (root) {
    var media = root.querySelector('.media');
    var controls = root.querySelector('.controls');
    if (!media || !controls) return;

    var play = root.querySelector('[data-play]');
    var seek = root.querySelector('[data-seek]');
    var mute = root.querySelector('[data-mute]');
    var fs = root.querySelector('[data-fullscreen]');
    var current = root.querySelector('[data-current]');
    var duration = root.querySelector('[data-duration]');
    var signal = root.querySelector('.bars-played');
    var scrubbing = false;

    media.removeAttribute('controls');
    controls.hidden = false;
    root.classList.add('enhanced');

    function setProgress(fraction) {
      var pct = (Math.min(Math.max(fraction, 0), 1) * 100).toFixed(2) + '%';
      seek.style.setProperty('--p', pct);
      if (signal) signal.style.setProperty('--p', pct);
    }

    function sync() {
      var d = media.duration;
      duration.textContent = fmt(d);
      if (!scrubbing) {
        var f = d ? media.currentTime / d : 0;
        seek.value = Math.round(f * 1000);
        setProgress(f);
      }
      current.textContent = fmt(media.currentTime);
      seek.setAttribute('aria-valuetext', fmt(media.currentTime) + ' of ' + fmt(d));
    }

    function toggle() {
      if (media.paused || media.ended) {
        var p = media.play();
        if (p && p.catch) p.catch(function () {});
      } else {
        media.pause();
      }
    }

    play.addEventListener('click', toggle);
    if (media.tagName === 'VIDEO') media.addEventListener('click', toggle);

    media.addEventListener('play', function () {
      root.classList.add('playing');
      play.setAttribute('aria-label', 'Pause');
    });
    ['pause', 'ended'].forEach(function (ev) {
      media.addEventListener(ev, function () {
        root.classList.remove('playing');
        play.setAttribute('aria-label', 'Play');
      });
    });
    ['loadedmetadata', 'durationchange', 'timeupdate', 'seeked'].forEach(function (ev) {
      media.addEventListener(ev, sync);
    });

    seek.addEventListener('input', function () {
      scrubbing = true;
      var f = seek.value / 1000;
      setProgress(f);
      if (media.duration) current.textContent = fmt(f * media.duration);
    });
    seek.addEventListener('change', function () {
      if (media.duration) media.currentTime = (seek.value / 1000) * media.duration;
      scrubbing = false;
      sync();
    });

    mute.addEventListener('click', function () {
      media.muted = !media.muted;
    });
    media.addEventListener('volumechange', function () {
      root.classList.toggle('muted', media.muted);
      mute.setAttribute('aria-pressed', String(media.muted));
      mute.setAttribute('aria-label', media.muted ? 'Unmute' : 'Mute');
    });

    if (fs) {
      fs.addEventListener('click', function () {
        if (document.fullscreenElement) return document.exitFullscreen();
        if (media.requestFullscreen) media.requestFullscreen();
        else if (media.webkitEnterFullscreen) media.webkitEnterFullscreen(); // iOS Safari
      });
    }

    sync();
  });
})();
