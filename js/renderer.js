// renderer.js
const { ipcRenderer, clipboard } = require("electron");
const fs = require("fs");
const marked = require("marked");
const hljs = require("highlight.js");
const CodeMirror = require("codemirror");
const path = require("path");
const katex = require("katex");


let editor = null;
let previewElement = null;
const lastOpenedFileKey = "lastOpenedFile";


function getOpenedFileList() {
  const storedList = localStorage.getItem("openedFileList");
  return storedList ? JSON.parse(storedList) : [];
}


function saveOpenedFileList(fileList) {
  localStorage.setItem("openedFileList", JSON.stringify(fileList));
}


function getLastOpenedFile() {
  return localStorage.getItem(lastOpenedFileKey);
}


function setLastOpenedFile(filePath) {
  localStorage.setItem(lastOpenedFileKey, filePath);
  addToOpenedFileList(filePath); 
}


function addToOpenedFileList(filePath) {
  const fileList = getOpenedFileList();
  if (!fileList.includes(filePath)) {
    fileList.push(filePath);
    saveOpenedFileList(fileList);
  }
}


function removeFromOpenedFileList(filePath) {
  const fileList = getOpenedFileList();
  const updatedList = fileList.filter((file) => file !== filePath);
  saveOpenedFileList(updatedList);
}


function clearOpenedFileList() {
  saveOpenedFileList([]);
}

const editModeKey = "editMode";
function getEditMode() {
  return localStorage.getItem(editModeKey);
}

function setEditMode(editMode) {
  localStorage.setItem(editModeKey, editMode);
}




const markedOptions = {
  highlight: function (code, lang, info) {
    const language = hljs.getLanguage(lang) ? lang : "plaintext";
    return hljs.highlightAuto(code, { language }).value;
  },
};


document.addEventListener("DOMContentLoaded", () => {
  previewElement = document.getElementById("preview");

  editor = CodeMirror.fromTextArea(document.getElementById("markdown-editor"), {
    keyMap: "default", 
    mode: "markdown", 
    lineWrapping: true, 
    theme: "panda-syntax", 
  });

 
  document.getElementById("search-input").addEventListener("input", (event) => {
    const searchTerm = event.target.value;
    searchInCurrentMode(searchTerm);
  });

  const filePath = localStorage.getItem("lastOpenedFile");
  if (filePath) {
    if (!fs.existsSync(filePath)) {
      localStorage.removeItem("lastOpenedFile");
      showActionArea();
    } else {
      try {
        const content = fs.readFileSync(filePath, "utf-8");
        editor.setValue(content); 
      } catch (error) {
        console.error("读取文件时出错:", error);
        showActionArea(); 
      }
    }
  } else {
    showActionArea(); 
  }

 
  initEditMode();


  const cachedTheme = localStorage.getItem("theme") || "light";
  setTheme(cachedTheme);

  
  editor.on("change", () => {
    const lastOpenedFile = getLastOpenedFile();
    const editMode = getEditMode();
    const markdownText = editor.getValue();

    if (lastOpenedFile && editMode === "edit") {
      saveFileAsync(lastOpenedFile, markdownText);
    }
    renderMarkdownWithKaTeX(markdownText);
  });

  updateFileList();
});

function initEditMode() {
  const editMode = localStorage.getItem("editMode");
  if (editMode) {
    setMode(editMode);
  } else {
    setMode("preview");
  }
}

function renderKaTeX() {
  const mathElements = document.querySelectorAll(".math");
  mathElements.forEach((element) => {
    try {
      katex.render(element.innerText, element, {
        throwOnError: false,
      });
    } catch (e) {
      console.error("KaTeX rendering error: ", e);
    }
  });
}


function renderMarkdownWithKaTeX(markdownText) {
  const html = marked.parse(customRenderer(markdownText), markedOptions);
  previewElement.innerHTML = html; 
  renderKaTeX(); 
  hljs.highlightAll();
}


function customRenderer(markdownText) {
  const inlineMathRegex = /\$(.*?)\$/g; 
  const blockMathRegex = /\$\$(.*?)\$\$/gs; 

  let processedText = markdownText;


  processedText = processedText.replace(inlineMathRegex, (match, p1) => {
    return `<span class="math">${p1}</span>`; 
  });


  processedText = processedText.replace(blockMathRegex, (match, p1) => {
    return `<div class="math block-math">${p1}</div>`; 
  });
  return processedText;
}


ipcRenderer.on("open-file", async (event) => {openFile();});


ipcRenderer.on("new-file", (event) => createNewFile());


async function createNewFile() {
  localStorage.removeItem("lastOpenedFile");
  const initMarkdowntext = "# Untitled Markdown Document\n";

  const { canceled, filePath } = await ipcRenderer.invoke("show-save-dialog", {
    filters: [{ name: "Markdown", extensions: ["md"] }],
  });

  if (!canceled && filePath) {
    const finalPath = filePath.toLowerCase().endsWith(".md")
      ? filePath
      : `${filePath}.md`;

    fs.writeFileSync(finalPath, initMarkdowntext, "utf-8");


    setLastOpenedFile(filePath);
    updateFileList();
    hideActionArea();
    editor.setValue(initMarkdowntext);
    setMode("edit");

    editor.focus();
    const lastLine = editor.lineCount() - 1; 
    const lastCol = editor.getLine(lastLine).length; 
    editor.setCursor({ line: lastLine, ch: lastCol }); 
  }
}

ipcRenderer.on("save-file", async (event) => {
  const filePath = localStorage.getItem("lastOpenedFile");
  if (!filePath) {
    const lastOpenedFolder = localStorage.getItem("lastOpenedFolder") || "";
    const { canceled, filePath } = await ipcRenderer.invoke(
      "show-save-dialog",
      {
        defaultPath: lastOpenedFolder,
        filters: [{ name: "Markdown", extensions: ["md"] }],
      }
    );

    if (!canceled && filePath) {
      const markdownText = editor.getValue();
      const finalPath = filePath.toLowerCase().endsWith(".md")
        ? filePath
        : `${filePath}.md`;
      fs.writeFileSync(finalPath, markdownText, "utf-8");
      updateFileList(lastOpenedFolder);
    }
  } else {
    const markdownText = editor.getValue();
    fs.writeFileSync(filePath, markdownText, "utf-8");
  }
});


ipcRenderer.on("export-pdf", async (event, filePath) => {
  let markdownText = editor.getValue();
  ipcRenderer.invoke("export-pdf", filePath, markdownText).then(() => {
      console.log("PDF export started.");
    }).catch((error) => {
      console.error("Failed to start PDF export:", error);
    });
});


ipcRenderer.on("export-html", async (event, filePath) => {
  const markdownText = editor.getValue();
  const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Exported HTML</title>
</head>
<body>
${marked.parse(markdownText)}
</body>
</html>
    `;
  fs.writeFileSync(filePath, htmlContent, "utf-8");
});


ipcRenderer.on("set-mode", (event, mode) => {
  setMode(mode);
});

function setMode(mode) {
  const editorElement = document.querySelector(".CodeMirror");
  if (mode === "preview") {
    editorElement.style.display = "none"; 
    previewElement.style.display = "block"; 
  } else if (mode === "edit") {
    editorElement.style.display = "block"; 
    previewElement.style.display = "none"; 
  }
  updateEditorContent();
  setEditMode(mode);
}


function updateEditorContent() {
  const filePath = localStorage.getItem("lastOpenedFile");
  if (filePath) {
    const content = fs.readFileSync(filePath, "utf-8");
    editor.setValue(content);
    renderMarkdownWithKaTeX(content);
  }
}


ipcRenderer.on("set-theme", (event, theme) => {
  setTheme(theme);
});


function setTheme(theme) {
  console.log("set theme ", theme);
  document.body.className = theme === "dark" ? "dark-theme" : "light-theme";


  localStorage.setItem("theme", theme);
  const cachedHighlightTheme =
    localStorage.getItem("highlightTheme") || "github";
  setHighlightTheme(cachedHighlightTheme);

  const editorElement = document.querySelector(".CodeMirror");
  if (editorElement) {
    editorElement.classList.remove("dark-theme", "light-theme");
    editorElement.classList.add(
      theme === "dark" ? "dark-theme" : "light-theme"
    );
  }
}


let searchMatches = [];
let searchIndex = -1;


function showSearchModal() {
  const modal = document.getElementById("search-modal");
  const input = document.getElementById("search-input");
  const prevButton = document.getElementById("search-prev");
  const nextButton = document.getElementById("search-next");

  modal.style.display = "flex";
  input.focus();

  input.addEventListener("input", handleSearchInput);
  prevButton.addEventListener("click", () => navigateSearch(-1));
  nextButton.addEventListener("click", () => navigateSearch(1));

  function handleSearchInput() {
    const searchTerm = input.value.trim();
    if (searchTerm) {
      performSearch(searchTerm);
    } else {
      clearHighlights();
    }
  }

  function closeModal() {
    modal.style.display = "none";
    input.value = "";
    searchMatches = [];
    searchIndex = -1;
    clearHighlights();

    input.removeEventListener("input", handleSearchInput);
    prevButton.removeEventListener("click", () => navigateSearch(-1));
    nextButton.removeEventListener("click", () => navigateSearch(1));
  }

  modal.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeModal();
    }
  });
}


function performSearch(searchTerm) {
  const markdownText = editor.getValue();
  const regex = new RegExp(searchTerm, "gi");
  searchMatches = [];
  let match;
  while ((match = regex.exec(markdownText)) !== null) {
    searchMatches.push({
      start: match.index,
      end: regex.lastIndex,
      text: match[0],
    });
  }

  if (searchMatches.length > 0) {
    searchIndex = 0; 
    highlightMatch();
  } else {
    clearHighlights();
  }
}

function highlightMatch() {
  if (searchMatches.length === 0 || searchIndex < 0) return;

  const markdownText = editor.getValue();
  let highlightedText = "";
  let lastIndex = 0;

  searchMatches.forEach((match, i) => {
    const { start, end, text } = match;
    highlightedText += markdownText.slice(lastIndex, start);
    if (i === searchIndex) {
      highlightedText += `<mark>${text}</mark>`;
    } else {
      highlightedText += text;
    }
    lastIndex = end;
  });

  highlightedText += markdownText.slice(lastIndex);

  previewElement.innerHTML = marked.parse(highlightedText);

  const markElement = document.querySelector("mark");
  if (markElement) {
    markElement.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}


function clearHighlights() {
  const markdownText = editor.getValue();
  previewElement.innerHTML = marked.parse(
    renderMarkdownWithKaTeX(markdownText)
  );
}


function navigateSearch(direction) {
  if (searchMatches.length === 0) return;
  searchIndex = (searchIndex + direction + searchMatches.length) % searchMatches.length;
  highlightMatch();
}


ipcRenderer.on("trigger-search", showSearchModal);


function getSearchTarget() {
  const editMode = getEditMode();
  if (editMode === "edit") {
    return editor; 
  } else {
    return previewElement; 
  }
}


function searchInCurrentMode(searchTerm) {
  const editMode = getEditMode();
  const target = getSearchTarget();
  if (editMode === "edit") {
    const cursor = target.getSearchCursor(searchTerm, null, { caseFold: true });
    if (cursor.findNext()) {
      target.setSelection(cursor.from(), cursor.to());
      target.scrollIntoView(cursor.from());
    } else {
      alert("No match found");
    }
  } else {
    const content = target.innerHTML;
    const regex = new RegExp(searchTerm, "gi");
    const highlightedContent = content.replace(
      regex,
      (match) => `<span class="highlight">${match}</span>`
    );
    target.innerHTML = highlightedContent;
  }
}


function isSupportedFile(file) {
  const supportedTypes = [".txt", ".md"]; 
  try {
    const stats = fs.statSync(file.path); 
    if (stats.isDirectory()) {
      return false;
    }
    
    return supportedTypes.some((type) => file.name.endsWith(type));
  } catch (error) {
    console.error("Error checking file:", error);
    return false; 
  }
}


function showUnsupportedFileMessage(file) {
  const previewArea = document.getElementById("preview"); 
  previewArea.innerHTML = `<div class="unsupported-message">
        暂不支持打开文件：${file.name}
    </div>`;
}

function showActionArea() {
  document.getElementById("left-aside").style.display = "none";
  const actionArea = document.getElementById("action-area");
  actionArea.style.display = "flex";

  document.getElementById("create-file-btn").addEventListener("click", createNewFile);
  document.getElementById("open-file-btn").addEventListener("click", openFile);
}


async function openFile() {
  const { canceled, filePaths } = await ipcRenderer.invoke("show-open-dialog", {
    filters: [{ name: "Markdown", extensions: ["md"] }],
    properties: ["openFile"],
  });

  if (!canceled && filePaths.length > 0) {
    const filePath = filePaths[0];
    const content = fs.readFileSync(filePath, "utf-8");
    editor.setValue(content); 

    setLastOpenedFile(filePath);
    updateFileList();
    hideActionArea();
  }
  return !canceled;
}


function hideActionArea() {
  document.getElementById("left-aside").style.display = "block";
  document.getElementById("action-area").style.display = "none";
}

function updateActiveStatus(fileList, fileItem) {
  Array.from(fileList.children).forEach((child) => {
    child.classList.remove("active"); 
  });
  fileItem.classList.add("active"); 
}


function handleFileClick(file, fileList, fileItem) {
  localStorage.setItem("lastOpenedFile", file.path);
  updateActiveStatus(fileList, fileItem);

  if (isSupportedFile(file)) {
    const content = fs.readFileSync(file.path, "utf-8");
    editor.setValue(content); 
  } else {
    showUnsupportedFileMessage(file);
  }
}

ipcRenderer.on("cut", () => {
  const selection = editor.getSelection();
  if (selection) {
    clipboard.writeText(selection); 
    editor.replaceSelection(""); 
  }
});

ipcRenderer.on("copy", () => {
  const selection = editor.getSelection();
  if (selection) {
    clipboard.writeText(selection); 
  }
});

ipcRenderer.on("paste", () => {
  const clipboardText = clipboard.readText(); 
  editor.replaceSelection(clipboardText); 
});

ipcRenderer.on("undo", () => {
  editor.execCommand("undo");
});

ipcRenderer.on("redo", () => {
  editor.execCommand("redo");
});

ipcRenderer.on("bold", () => {
  const selection = editor.getSelection();
  if (selection) {
    const boldText = `**${selection}**`;
    editor.replaceSelection(boldText);
  } else {
    editor.replaceSelection("****"); 
    editor.setCursor(editor.getCursor().line, editor.getCursor().ch - 2);
  }
});


ipcRenderer.on("italic", () => {
  const selection = editor.getSelection();
  if (selection) {
    const italicText = `*${selection}*`; 
    editor.replaceSelection(italicText);
  } else {
    editor.replaceSelection("**"); 
    editor.setCursor(editor.getCursor().line, editor.getCursor().ch - 1); 
  }
});


ipcRenderer.on("strikethrough", () => {
    const selection = editor.getSelection();
    if (selection) {
      const underlineText = `~~${selection}~~`;
      editor.replaceSelection(underlineText);
    } else {
      editor.replaceSelection("~~~~");
      editor.setCursor(editor.getCursor().line, editor.getCursor().ch - 4);
    }
  });
  

ipcRenderer.on("underline", () => {
  const selection = editor.getSelection();
  if (selection) {
    const underlineText = `<u>${selection}</u>`;
    editor.replaceSelection(underlineText);
  } else {
    editor.replaceSelection("<u></u>");
    editor.setCursor(editor.getCursor().line, editor.getCursor().ch - 4);
  }
});


ipcRenderer.on("codeBlock", () => {
  const selection = editor.getSelection();
  if (selection) {
    const codeBlock = `\`\`\`\n${selection}\n\`\`\``;
    editor.replaceSelection(codeBlock);
  } else {
    editor.replaceSelection("```\n\n```");
    editor.setCursor(editor.getCursor().line - 1, 0);
  }
});


ipcRenderer.on("inlineCode", () => {
  const selection = editor.getSelection();
  if (selection) {
    const inlineCodeText = `\`${selection}\``;
    editor.replaceSelection(inlineCodeText);
  } else {
    editor.replaceSelection("` `");
    editor.setCursor(editor.getCursor().line, editor.getCursor().ch - 1); 
  }
});


ipcRenderer.on("unorderedList", () => {
  const selection = editor.getSelection();
  const lines = selection.split("\n");
  const listItems = lines.map((line) => `- ${line}`).join("\n");
  editor.replaceSelection(listItems || "- ");
});


ipcRenderer.on("orderedList", () => {
  const selection = editor.getSelection();
  const lines = selection.split("\n");
  const listItems = lines
    .map((line, index) => `${index + 1}. ${line}`)
    .join("\n");
  editor.replaceSelection(listItems || "1. ");
});


ipcRenderer.on("quote", () => {
  const selection = editor.getSelection();
  const lines = selection.split("\n");
  const quotedLines = lines.map((line) => `> ${line}`).join("\n");
  editor.replaceSelection(quotedLines || "> ");
});


ipcRenderer.on("link", () => {
  const selection = editor.getSelection();
  if (selection) {
    const linkText = `[${selection}](https://)`;
    editor.replaceSelection(linkText);
    editor.setCursor(editor.getCursor().line, editor.getCursor().ch - 4); 
  } else {
    editor.replaceSelection("[Link Text](https://)");
    editor.setCursor(editor.getCursor().line, editor.getCursor().ch - 12); 
  }
});


ipcRenderer.on("image", () => {
  const selection = editor.getSelection();
  if (selection) {
    const imageText = `![${selection}](https://)`;
    editor.replaceSelection(imageText);
    editor.setCursor(editor.getCursor().line, editor.getCursor().ch - 4); 
  } else {
    editor.replaceSelection("![Alt Text](https://)");
    editor.setCursor(editor.getCursor().line, editor.getCursor().ch - 12); 
  }
});


ipcRenderer.on("heading-1", () => {
  console.log("heading-1");
  const selection = editor.getSelection();
  if (selection) {
    const headingText = `# ${selection}`;
    editor.replaceSelection(headingText);
  } else {
    editor.replaceSelection("# ");
  }
});


ipcRenderer.on("heading-1", () => {
  console.log("heading-1");
  const selection = editor.getSelection();
  if (selection) {
    const headingText = `# ${selection}`;
    editor.replaceSelection(headingText);
  } else {
    editor.replaceSelection("# ");
  }
});


ipcRenderer.on("heading-2", () => {
  console.log("heading-2");
  const selection = editor.getSelection();
  if (selection) {
    const headingText = `## ${selection}`;
    editor.replaceSelection(headingText);
  } else {
    editor.replaceSelection("## ");
  }
});


ipcRenderer.on("heading-3", () => {
  console.log("heading-3");
  const selection = editor.getSelection();
  if (selection) {
    const headingText = `### ${selection}`;
    editor.replaceSelection(headingText);
  } else {
    editor.replaceSelection("### ");
  }
});


ipcRenderer.on("heading-4", () => {
  console.log("heading-4");
  const selection = editor.getSelection();
  if (selection) {
    const headingText = `#### ${selection}`;
    editor.replaceSelection(headingText);
  } else {
    editor.replaceSelection("#### ");
  }
});


ipcRenderer.on("heading-5", () => {
  console.log("heading-5");
  const selection = editor.getSelection();
  if (selection) {
    const headingText = `##### ${selection}`;
    editor.replaceSelection(headingText);
  } else {
    editor.replaceSelection("##### ");
  }
});


ipcRenderer.on("heading-6", () => {
  console.log("heading-6");
  const selection = editor.getSelection();
  if (selection) {
    const headingText = `###### ${selection}`;
    editor.replaceSelection(headingText);
  } else {
    editor.replaceSelection("###### ");
  }
});


let showLeftSide = true;

ipcRenderer.on("toggle-left-aside", () => {
  showLeftSide = !showLeftSide;
  const leftAside = document.getElementById("left-aside");
  if (showLeftSide) {
    leftAside.style.display = "block";
  } else {
    leftAside.style.display = "none";
  }
});


const saveFileAsync = async (filePath, content) => {
  try {
    await fs.promises.writeFile(filePath, content, "utf-8");
    console.log("File saved successfully:", filePath);
  } catch (error) {
    console.error("Error writing file:", error);
  }
};


function getFileObjectsFromOpenedList() {
  return getOpenedFileList()
    .map((filePath) => {
      try {
        const stats = fs.statSync(filePath); 
        return {
          name: path.basename(filePath), 
          path: filePath, 
          isDirectory: stats.isDirectory(),
        };
      } catch (error) {
        console.error(`Error processing file: ${filePath}`, error);
        return null; 
      }
    })
    .filter((file) => file !== null); 
}


function updateFileList() {
  const files = getFileObjectsFromOpenedList();
  const fileListDocument = document.getElementById("file-list");
  fileListDocument.innerHTML = ""; 
  const lastOpenedFilePath = getLastOpenedFile();

  files.forEach((file) => {
    const fileItem = document.createElement("li");
    fileItem.textContent = file.name;
    fileItem.setAttribute("data-fullname", file.name);

    if (file.path === lastOpenedFilePath) {
      fileItem.classList.add("active");
    }

    fileItem.onclick = () => {
      handleFileClick(file, fileListDocument, fileItem);
    };

    fileItem.oncontextmenu = (event) => {
      event.preventDefault(); 
      const menu = document.createElement("ul");
      menu.style.position = "absolute";
      menu.style.top = `${event.clientY}px`;
      menu.style.left = `${event.clientX}px`;
      menu.classList.add("context-menu");

      const copyItem = document.createElement("li");
      copyItem.textContent = "Copy";
      copyItem.onclick = () => {
        copyFile(file.path);
        document.body.removeChild(menu); 
      };

      const deleteItem = document.createElement("li");
      deleteItem.textContent = "Delete";
      deleteItem.onclick = () => {
        deleteFile(file.path);
        document.body.removeChild(menu); 

        const lastOpenFilePath = getLastOpenedFile();
        if (file.path === lastOpenFilePath) {
          editor.setValue("");
        }
      };

      menu.appendChild(copyItem);
      menu.appendChild(deleteItem);
      document.body.appendChild(menu);

      document.addEventListener(
        "click",
        () => {
          if (document.body.contains(menu)) {
            document.body.removeChild(menu);
          }
        },
        { once: true }
      );
    };

    fileListDocument.appendChild(fileItem);
  });
}

function deleteFile(filePath) {
  fs.unlink(filePath, (err) => {
    if (err) {
      console.error("Error deleting file:", err);
    } else {
      console.log("File deleted", filePath);
      removeFromOpenedFileList(filePath);
      updateFileList();
    }
  });
}

ipcRenderer.on("show-confirm-dialog", (event, message) => {
  const lastOpenedFilePath = localStorage.getItem("lastOpenedFile");
  const markdownText = editor.getValue();
  if (!lastOpenedFilePath && markdownText) {
    const userChoice = window.confirm(message);
    ipcRenderer.send("confirm-close", userChoice);
  } else {
    ipcRenderer.send("confirm-close", true);
  }
});

ipcRenderer.on("change-highlight-theme", (event, highlightTheme) => {
  setHighlightTheme(highlightTheme);
});


function setHighlightTheme(highlightTheme) {
  const highlightLink = document.getElementById("highlightjs-theme");
  if(highlightLink){
    const cachedTheme = localStorage.getItem("theme") || "light"; 
    const highlightThemeUrl = `../css/highlightjs/${highlightTheme}-${cachedTheme}.min.css`;
    console.log("highlightThemeUrl",highlightThemeUrl)
    highlightLink.href = highlightThemeUrl;
    localStorage.setItem("highlightTheme", highlightTheme);
    hljs.highlightAll();
  }

}
