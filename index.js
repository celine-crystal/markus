// index.js
const {
  app,
  BrowserWindow,
  Menu,
  dialog,
  ipcMain,
  globalShortcut,
  nativeTheme,
} = require("electron");
const path = require("path");
const markdownpdf = require("markdown-pdf");

// dev only
// require("electron-reload")(path.join(__dirname), {
//   electron: path.join(__dirname, "node_modules", ".bin", "electron"),
//   hardResetMethod: "exit",
// });

let mainWindow;
let isClosing = false; 


nativeTheme.on("updated", () => {
  currentTheme = nativeTheme.shouldUseDarkColors ? "dark" : "light";
  mainWindow.webContents.send("set-theme", currentTheme);
});


ipcMain.on("confirm-close", (event, userChoice) => {
  isClosing = userChoice;
  if (isClosing) {
    isClosing = true;
    app.quit(); 
  }
});


ipcMain.handle("show-save-dialog", async (event, options) => {
  return await dialog.showSaveDialog(mainWindow, options);
});


ipcMain.handle("show-open-dialog", async (event, options) => {
  return await dialog.showOpenDialog(mainWindow, options);
});

ipcMain.handle("export-pdf", async (event, filePath, markdownText) => {
  try {
    
    const customCssPath = path.join(__dirname, "css/markdown.css");

    if (!require("fs").existsSync(customCssPath)) {
      throw new Error("Custom CSS file not found: " + customCssPath);
    }

    
    markdownpdf({
      cssPath: customCssPath, 
      paperFormat: "A4", 
      paperOrientation: "portrait", 
      paperBorder: "1cm", 
    })
      .from.string(markdownText) 
      .to(filePath, () => {
        console.log(`PDF has been saved to ${filePath}`);
      });
  } catch (error) {
    console.error("Error exporting PDF:", error);
  }
});

app.on("ready", async () => {
  mainWindow = new BrowserWindow({
    width: 2048,
    height: 1600,
    webPreferences: {
      preload: path.join(__dirname, "renderer.js"),
      contextIsolation: true,
      nodeIntegration: true,
    },
  });
  registerKeyMap(mainWindow);
  mainWindow.loadFile("index.html");

  mainWindow.on("close", (event) => {
    if (isClosing) {
      app.quit();
    } else {
      mainWindow.webContents.send(
        "show-confirm-dialog",
        "You have unsaved changes. Are you sure you want to exit?"
      );
      // prevent default
      event.preventDefault();
    }
  });

  // close window
  mainWindow.on("closed", (event) => {
    mainWindow = null;
    app.quit();
  });

  // dev only
//   mainWindow.webContents.openDevTools();

  // set context menu
  mainWindow.webContents.on("context-menu", (event, params) => {
    const x = params.x;
    const y = params.y;

    mainWindow.webContents
      .executeJavaScript(
        `
        var element = document.elementFromPoint(${x}, ${y});
        element ? element.id : null;
        `
      )
      .then((elementId) => {
        console.log("Clicked element ID:", elementId);

        let menu = editorContextMenu;

        if (elementId === "left-aside") {
          menu = leftAsideContextMenu;
          menu.popup({ window: mainWindow, x, y });
        } else if (!elementId) {
          menu.popup({ window: mainWindow, x, y });
        } else if (elementId === "preview") {
          menu = previewContextMenu;
          menu.popup({ window: mainWindow, x, y });
        }
      });
  });

  const highlightTheme = await mainWindow.webContents.executeJavaScript(
    `localStorage.getItem('highlightTheme')`
  );
  const theme = await mainWindow.webContents.executeJavaScript(
    `localStorage.getItem('theme')`
  );
  const editMode = await mainWindow.webContents.executeJavaScript(
    `localStorage.getItem('editMode')`
  );

  const menuTemplate = [
    {
      label: "File",
      submenu: [
        {
          label: "New File",
          accelerator: "CmdOrCtrl+N",
          click: async () => {
            mainWindow.webContents.send("new-file");
          },
        },
        {
          label: "Open File",
          accelerator: "CmdOrCtrl+O",
          click: async () => {
            mainWindow.webContents.send("open-file");
          },
        },
        {
          label: "Save File",
          accelerator: "CmdOrCtrl+S",
          click: async () => {
            mainWindow.webContents.send("save-file");
          },
        },
        {
          label: "Export as PDF",
          click: async () => {
            const { canceled, filePath } = await dialog.showSaveDialog(
              mainWindow,
              {
                filters: [{ name: "PDF", extensions: ["pdf"] }],
              }
            );

            if (!canceled && filePath) {
              mainWindow.webContents.send("export-pdf", filePath);
            }
          },
        },
        {
          label: "Export as HTML",
          click: async () => {
            const { canceled, filePath } = await dialog.showSaveDialog(
              mainWindow,
              {
                filters: [{ name: "HTML", extensions: ["html"] }],
              }
            );

            if (!canceled && filePath) {
              mainWindow.webContents.send("export-html", filePath);
            }
          },
        },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        {
          label: "Cut",
          accelerator: "CmdOrCtrl+X",
          click() {
            mainWindow.webContents.send("cut");
          },
        },
        {
          label: "Copy",
          accelerator: "CmdOrCtrl+C",
          click() {
            mainWindow.webContents.send("copy");
          },
        },
        {
          label: "Paste",
          accelerator: "CmdOrCtrl+V",
          click() {
            mainWindow.webContents.send("paste");
          },
        },
        {
          label: "Undo",
          accelerator: "CmdOrCtrl+Z",
          click() {
            mainWindow.webContents.send("undo");
          },
        },
        {
          label: "Redo",
          accelerator: "CmdOrCtrl+Shift+Z",
          click() {
            mainWindow.webContents.send("redo");
          },
        },
        { type: "separator" },
        {
          label: "Search",
          accelerator: "CmdOrCtrl+F",
          click: () => {
            mainWindow.webContents.send("trigger-search");
          },
        },
        {
          label: "Find Next",
          accelerator: "CmdOrCtrl+G",
          click: () => {
            mainWindow.webContents.send("search-next");
          },
        },
      ],
    },
    {
      label: "View",
      submenu: [
        {
          label: "Edit Mode",
          type: "radio",
          checked: editMode === "edit",
          accelerator: "CmdOrCtrl+E",
          click: () => {
            mainWindow.webContents.send("set-mode", "edit");
          },
        },
        {
          label: "Preview Mode",
          type: "radio",
          checked: editMode === "preview",
          accelerator: "CmdOrCtrl+P",
          click: () => {
            mainWindow.webContents.send("set-mode", "preview");
          },
        },
        {
          label: "Show/Hide Left Side ",
          accelerator: "CmdOrCtrl+L",
          click: () => {
            mainWindow.webContents.send("toggle-left-aside");
          },
        },
        { type: "separator" },
        {
          label: "Float on Top",
          type: "checkbox",
          accelerator: "CmdOrCtrl+T",
          click: (menuItem) => {
            mainWindow.setAlwaysOnTop(menuItem.checked);
          },
        },
        { role: "reload" },
      ],
    },
    {
      label: "Theme",
      submenu: [
        {
          label: "Light",
          type: "radio",
          checked: theme === "light",
          click: () => {
            mainWindow.setBackgroundColor("#33333");
            mainWindow.webContents.send("set-theme", "light");
          },
        },
        {
          label: "Dark",
          type: "radio",
          checked: theme === "dark",
          click: () => {
            mainWindow.setBackgroundColor("#ffffff");
            mainWindow.webContents.send("set-theme", "dark");
          },
        },
        {
          label: "Highlight Theme",
          submenu: [
            {
              label: "GitHub",
              type: "radio",
              checked: highlightTheme === "github",
              click: () => {
                mainWindow.webContents.send("change-highlight-theme", "github");
              },
            },
            {
              label: "Atom One",
              type: "radio",
              checked: highlightTheme === "atom-one",
              click: () => {
                mainWindow.webContents.send(
                  "change-highlight-theme",
                  "atom-one"
                );
              },
            },
            {
              label: "Tokyo Night",
              type: "radio",
              checked: highlightTheme === "tokyo-night",
              click: () => {
                mainWindow.webContents.send(
                  "change-highlight-theme",
                  "tokyo-night"
                );
              },
            },
            {
              label: "Stackoverflow",
              type: "radio",
              checked: highlightTheme === "stackoverflow",
              click: () => {
                mainWindow.webContents.send(
                  "change-highlight-theme",
                  "stackoverflow"
                );
              },
            },
            {
              label: "Qtcreator",
              type: "radio",
              checked: highlightTheme === "qtcreator",
              click: () => {
                mainWindow.webContents.send(
                  "change-highlight-theme",
                  "qtcreator"
                );
              },
            },
            {
              label: "Paraiso",
              type: "radio",
              checked: highlightTheme === "paraiso",
              click: () => {
                mainWindow.webContents.send(
                  "change-highlight-theme",
                  "paraiso"
                );
              },
            },
            {
              label: "Panda Syntax",
              type: "radio",
              checked: highlightTheme === "panda-syntax",
              click: () => {
                mainWindow.webContents.send(
                  "change-highlight-theme",
                  "panda-syntax"
                );
              },
            },
            {
              label: "Nnfx",
              type: "radio",
              checked: highlightTheme === "nnfx",
              click: () => {
                mainWindow.webContents.send("change-highlight-theme", "nnfx");
              },
            },
            {
              label: "Kimbie",
              type: "radio",
              checked: highlightTheme === "kimbie",
              click: () => {
                mainWindow.webContents.send("change-highlight-theme", "kimbie");
              },
            },
            {
              label: "Isbl Editor",
              type: "radio",
              checked: highlightTheme === "isbl-editor",
              click: () => {
                mainWindow.webContents.send(
                  "change-highlight-theme",
                  "isbl-editor"
                );
              },
            },
            {
              label: "Gradient",
              checked: highlightTheme === "gradient",
              type: "radio",
              click: () => {
                mainWindow.webContents.send(
                  "change-highlight-theme",
                  "gradient"
                );
              },
            },
          ],
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(menu);
});

const leftAsideContextMenu = Menu.buildFromTemplate([
  {
    label: "New File",
    click: () => {
      mainWindow.webContents.send("new-file");
    },
  },
  { type: "separator" },
  {
    label: "Edit Mode",
    click: () => {
      mainWindow.webContents.send("set-mode", "edit");
    },
  },
  {
    label: "Preview Mode",
    click: () => {
      mainWindow.webContents.send("set-mode", "preview");
    },
  },
  { type: "separator" },
  {
    label: "Toggle Left Side",
    click: () => {
      mainWindow.webContents.send("toggle-left-aside");
    },
  },
]);

const previewContextMenu = Menu.buildFromTemplate([
  { type: "separator" },
  {
    label: "Edit Mode",
    click: () => {
      mainWindow.webContents.send("set-mode", "edit");
    },
  },
  {
    label: "Preview Mode",
    click: () => {
      mainWindow.webContents.send("set-mode", "preview");
    },
  },
]);

const editorContextMenu = Menu.buildFromTemplate([
  {
    label: "Edit Mode",
    click: () => {
      mainWindow.webContents.send("set-mode", "edit");
    },
  },
  {
    label: "Preview Mode",
    click: () => {
      mainWindow.webContents.send("set-mode", "preview");
    },
  },
  { type: "separator" },
  {
    label: "Undo",
    click: () => {
      mainWindow.webContents.send("undo");
    },
  },
  {
    label: "Redo",
    click: () => {
      mainWindow.webContents.send("redo");
    },
  },
  { type: "separator" },
  { role: "cut" },
  { role: "copy" },
  { role: "paste" },
  { role: "selectAll" },
  { type: "separator" },
  {
    label: "Heading 1",
    click: () => {
      mainWindow.webContents.send("heading-1");
    },
  },
  {
    label: "Heading 2",
    click: () => {
      mainWindow.webContents.send("heading-2");
    },
  },
  {
    label: "Heading 3",
    click: () => {
      mainWindow.webContents.send("heading-3");
    },
  },
  {
    label: "Heading 4",
    click: () => {
      mainWindow.webContents.send("heading-4");
    },
  },
  { type: "separator" },
  {
    label: "Bold",
    click: () => {
      mainWindow.webContents.send("bold");
    },
  },
  {
    label: "Italic",
    click: () => {
      mainWindow.webContents.send("italic");
    },
  },
  {
    label: "Strikethrough",
    click: () => {
      mainWindow.webContents.send("strikethrough");
    },
  },
  {
    label: "Inline Code",
    click: () => {
      mainWindow.webContents.send("inlineCode");
    },
  },
  {
    label: "Code Block",
    click: () => {
      mainWindow.webContents.send("codeBlock");
    },
  },
  {
    label: "Insert Link",
    click: () => {
      mainWindow.webContents.send("link");
    },
  },
  {
    label: "Insert Image",
    click: () => {
      mainWindow.webContents.send("image");
    },
  },
]);

function registerKeyMap(mainWindow) {
  globalShortcut.register("CommandOrControl+B", () => {
    mainWindow.webContents.send("bold");
  });

  globalShortcut.register("CommandOrControl+Shift+I", () => {
    mainWindow.webContents.send("italic");
  });

  globalShortcut.register("CommandOrControl+Shift+S", () => {
    mainWindow.webContents.send("strikethrough");
  });

  globalShortcut.register("CommandOrControl+Shift+U", () => {
    mainWindow.webContents.send("underline");
  });

  globalShortcut.register("CommandOrControl+`", () => {
    mainWindow.webContents.send("codeBlock");
  });

  globalShortcut.register("CommandOrControl+Shift+`", () => {
    mainWindow.webContents.send("inlineCode");
  });

  globalShortcut.register("CommandOrControl+Shift+L", () => {
    mainWindow.webContents.send("unorderedList");
  });

  globalShortcut.register("CommandOrControl+Shift+O", () => {
    mainWindow.webContents.send("orderedList");
  });

  globalShortcut.register("CommandOrControl+Shift+Q", () => {
    mainWindow.webContents.send("quote");
  });

  globalShortcut.register("CommandOrControl+Shift+K", () => {
    mainWindow.webContents.send("link");
  });

  globalShortcut.register("CommandOrControl+Shift+P", () => {
    mainWindow.webContents.send("image");
  });

  globalShortcut.register("CommandOrControl+Shift+1", () => {
    mainWindow.webContents.send("heading-1");
  });

  globalShortcut.register("CommandOrControl+Shift+2", () => {
    mainWindow.webContents.send("heading-2");
  });

  globalShortcut.register("CommandOrControl+Shift+3", () => {
    mainWindow.webContents.send("heading-3");
  });

  globalShortcut.register("CommandOrControl+Shift+4", () => {
    mainWindow.webContents.send("heading-4");
  });

  globalShortcut.register("CommandOrControl+Shift+5", () => {
    mainWindow.webContents.send("heading-5");
  });

  globalShortcut.register("CommandOrControl+Shift+6", () => {
    mainWindow.webContents.send("heading-6");
  });
}
