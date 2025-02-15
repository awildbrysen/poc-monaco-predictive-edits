import { createRoot } from 'react-dom/client';
import React from 'react';
import { App } from './app';
import './userWorker';

const domNode = document.getElementById('app')
if (!domNode) throw new Error('No root node found.');

const root = createRoot(domNode);
root.render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
)