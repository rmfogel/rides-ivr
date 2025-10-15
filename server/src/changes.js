// Add these route handlers to app.js
import { voiceRouter } from './routes/voice.js';
import { manageRouter } from './routes/manage.js';

// And add this line after the voice router middleware
app.use('/voice/manage', manageRouter);