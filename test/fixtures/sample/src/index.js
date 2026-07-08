import { handler } from './api.js';

const app = { get: () => {} };

app.get('/login', handler);
