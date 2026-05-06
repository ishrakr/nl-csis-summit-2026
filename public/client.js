const socket = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`);
const statusEl = document.getElementById('status');
const floatLayer = document.getElementById('float-layer');

const emojiButtons = document.querySelectorAll('.emoji-button');

function spawnEmoji(emoji) {
  const node = document.createElement('span');
  node.className = 'float-emoji';

  const x = Math.random() * 100;
  const size = 24 + Math.random() * 28;
  const duration = 2.8 + Math.random() * 1.4;
  const drift = (Math.random() * 160 - 80).toFixed(0) + 'px';
  const spin = (Math.random() * 160 - 80).toFixed(0) + 'deg';

  node.textContent = emoji;
  node.style.setProperty('--x', `${x}%`);
  node.style.setProperty('--size', `${size}px`);
  node.style.setProperty('--duration', `${duration}s`);
  node.style.setProperty('--drift', drift);
  node.style.setProperty('--spin', spin);

  floatLayer.appendChild(node);
  node.addEventListener('animationend', () => node.remove(), { once: true });
}

emojiButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const emoji = button.dataset.emoji;
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'emoji', emoji }));
    }
    spawnEmoji(emoji);
  });
});

socket.addEventListener('open', () => {
  statusEl.textContent = 'Live connection ready. Tap an emoji to rate.';
});

socket.addEventListener('close', () => {
  statusEl.textContent = 'Disconnected. Refresh to reconnect.';
});

socket.addEventListener('error', () => {
  statusEl.textContent = 'Connection error. Refresh to try again.';
});

socket.addEventListener('message', (event) => {
  let message;

  try {
    message = JSON.parse(event.data);
  } catch {
    return;
  }

  if (message.type === 'emoji' && typeof message.emoji === 'string') {
    spawnEmoji(message.emoji);
  }
});
