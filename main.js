const { app, BrowserWindow, Menu, screen, ipcMain, desktopCapturer } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

let circleWindow = null;
let mainWindow = null;

function createWindow() {
  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;
  const windowWidth = 400;
  const windowHeight = 600;
  const x = 1050;
  const y = 100;

  const win = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    x: x,
    y: y,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  // Request media permissions
  win.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'media') {
      callback(true);
    } else {
      callback(false);
    }
  });

  // Remove menu bar completely
  Menu.setApplicationMenu(null);

  win.loadFile('index.html');

  // Close circle window when main window closes
  win.on('close', () => {
    if (circleWindow && !circleWindow.isDestroyed()) {
      circleWindow.close();
    }
  });

  mainWindow = win;
  return win;
}

function createCircleWindow() {
  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;
  const circleSize = 150;
  const x = 0;
  const y = screenHeight - circleSize;

  const circleWin = new BrowserWindow({
    width: circleSize,
    height: circleSize,
    x: 50,
    y: 500,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: true,
    minWidth: 300,
    minHeight: 300,
    maxWidth: 800,
    maxHeight: 800,
    aspectRatio: 1, // Force square aspect ratio
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    }
  });

  // Enforce square aspect ratio on resize
  circleWin.on('will-resize', (event, newBounds) => {
    const size = Math.min(newBounds.width, newBounds.height);
    event.preventDefault();
    circleWin.setSize(size, size);
  });

  // Request media permissions for circle window
  circleWin.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'media') {
      callback(true);
    } else {
      callback(false);
    }
  });

  // Remove menu bar completely
  Menu.setApplicationMenu(null);

  circleWin.loadFile('circle.html');

  return circleWin;
}

// IPC handler for camera selection
ipcMain.on('camera-selected', (event, cameraId) => {
  if (circleWindow && !circleWindow.isDestroyed()) {
    circleWindow.webContents.send('update-camera', cameraId);
  }
});

// IPC handler for blur toggle
ipcMain.on('blur-toggle', (event, enabled) => {
  if (circleWindow && !circleWindow.isDestroyed()) {
    circleWindow.webContents.send('update-blur', enabled);
  }
});

// IPC handler to get screen sources for recording
ipcMain.handle('get-screen-sources', async () => {
  const sources = await desktopCapturer.getSources({
    types: ['window', 'screen'],
    thumbnailSize: { width: 0, height: 0 }
  });
  
  // Get main window properties for filtering
  let mainWindowInfo = null;
  if (mainWindow && !mainWindow.isDestroyed()) {
    const bounds = mainWindow.getBounds();
    const title = mainWindow.getTitle();
    mainWindowInfo = {
      title: title,
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y
    };
  }
  
  // Filter out the main window using multiple checks
  const filteredSources = sources.filter(source => {
    // Always include screen sources (full screen capture)
    if (source.id.startsWith('screen:')) {
      return true;
    }
    
    // Exclude window sources that match the main window
    if (mainWindowInfo && source.name) {
      // Check by title
      if (source.name.includes('Boom Box') || 
          source.name.includes('boom-box') ||
          source.name.toLowerCase().includes('boom box')) {
        return false;
      }
      
      // Additional check: if it's a window source, we can be more aggressive
      // Exclude any window that might be the main window
      // The main window typically has a specific size (400x600 in our case)
      if (source.id.startsWith('window:')) {
        // If the source name matches common Electron window patterns for our app
        const windowName = source.name.toLowerCase();
        if (windowName.includes('electron') || 
            windowName.includes('chromium') ||
            windowName === 'boom box' ||
            windowName === 'boom-box') {
          return false;
        }
      }
    }
    
    // Include all other windows (like the circle window)
    return true;
  });
  
  // Sort to prefer screen sources (full screen capture)
  filteredSources.sort((a, b) => {
    if (a.id.startsWith('screen:') && !b.id.startsWith('screen:')) return -1;
    if (!a.id.startsWith('screen:') && b.id.startsWith('screen:')) return 1;
    return 0;
  });
  
  return filteredSources;
});

// IPC handler to save recording to downloads/boom-box folder
ipcMain.handle('save-recording', async (event, bufferArray, fileName) => {
  const downloadsPath = path.join(os.homedir(), 'Downloads', 'boom-box');
  
  // Create directory if it doesn't exist
  if (!fs.existsSync(downloadsPath)) {
    fs.mkdirSync(downloadsPath, { recursive: true });
  }
  
  // Convert array back to Buffer
  const buffer = Buffer.from(bufferArray);
  const filePath = path.join(downloadsPath, fileName);
  fs.writeFileSync(filePath, buffer);
  
  return filePath;
});

app.whenReady().then(() => {
  createWindow();
  circleWindow = createCircleWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
      circleWindow = createCircleWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

