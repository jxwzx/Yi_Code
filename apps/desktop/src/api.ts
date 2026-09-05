const _hostname = window.location.hostname
const _isLAN = !!_hostname && _hostname !== 'localhost' && _hostname !== '127.0.0.1'

export const API_BASE = _isLAN ? `http://${_hostname}:8000` : 'http://localhost:8000'
export const WS_BASE = _isLAN ? `ws://${_hostname}:8000` : 'ws://localhost:8000'
