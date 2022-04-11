'use strict';

// アプリケーションをコントロールするモジュール
const electron = require('electron');
const path = require("path");

const fs = require('fs');



const app = electron.app;
const BrowserWindow = electron.BrowserWindow;
let mainWindow;

// Electronの初期化完了後に実行
app.on('ready', function () {

  mainWindow = new BrowserWindow({
    // ウィンドウ作成時のオプション
    "width": 1920,
    "height": 1080,
    "transparent": false,    // ウィンドウの背景を透過
    webPreferences: {
      preload: path.join(__dirname, '../loadcdf.js'),
      contextIsolation: true,
    }
  });
  mainWindow.loadFile('index.html');
  // mainWindow.openDevTools();

  //ウィンドウが閉じられたらアプリも終了
  mainWindow.on('closed', function () {
    mainWindow = null;
  });
});