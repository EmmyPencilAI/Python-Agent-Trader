#!/usr/bin/env node

// Auto-deploy script for VS Code
// Run this after making changes to automatically build and deploy

const { execSync } = require('child_process');
const path = require('path');

console.log('🔄 Auto-deploy: Building frontend...');

try {
    execSync('npm run build', { stdio: 'inherit', cwd: __dirname });
    console.log('✅ Build successful, committing and pushing...');
    
    execSync('git add .', { stdio: 'inherit', cwd: __dirname });
    execSync('git commit -m "Auto-deploy: Frontend updates"', { stdio: 'inherit', cwd: __dirname });
    execSync('git push origin main', { stdio: 'inherit', cwd: __dirname });
    
    console.log('🚀 Deployed successfully!');
} catch (error) {
    console.error('❌ Deploy failed:', error.message);
    process.exit(1);
}