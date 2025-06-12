// js/middle-area-down.js

// 存储选中的文件
let selectedFiles = [];

// 存储当前聊天ID。初始为null，表示新会话。
let currentChatId = null;

// 文件类型映射
const fileTypeMap = {
    'image': '.png,.jpg,.jpeg,.webp,.heic,.heif',
    'document': '.pdf,.txt,.md,.csv,.xml',
    'code': '.js,.py,.html,.css,.md,.xml',
    'audio': '.wav,.mp3,.aiff,.aac,.ogg,.flac',
    'video': '.mp4,.mpeg,.mov,.avi,.flv,.wmv,.3gp,.webm'
};

// 定义工具图标和提示信息
const tooltipTexts = {
    'image': '格式支持：PNG, JPEG, WEBP, HEIC, HEIF',
    'document': '格式支持：PDF, TXT, Markdown, CSV, XML',
    'code': '格式支持：JavaScript, Python, HTML, CSS, Markdown, XML',
    'audio': '格式支持：WAV, MP3, AIFF, AAC, OGG Vorbis, FLAC',
    'video': '格式支持：MP4, MPEG, MOV, AVI, X-FLV, WMV, 3GPP, WEBM'
};

// 存储当前请求的控制器
let currentController = null;

// >>> 关键修正：将 adjustInputHeight 变为模块内的全局函数 <<<
function adjustInputHeight() {
    const userInput = document.getElementById('user-input');
    if (!userInput) return; // 确保元素存在

    userInput.style.height = 'auto';
    const maxHeight = parseInt(getComputedStyle(userInput).maxHeight, 10);
    const calculatedHeight = Math.max(userInput.scrollHeight, 40);
    userInput.style.height = Math.min(calculatedHeight, maxHeight) + 'px';
    userInput.style.overflowY = calculatedHeight >= maxHeight ? 'auto' : 'hidden';
    userInput.scrollTop = userInput.scrollHeight;
}
// <<< 关键修正结束 >>>


// 初始化输入区域
export function initializeInputArea(displayMessage) {
    const userInput = document.getElementById('user-input');
    const inputContainer = document.getElementById('input-container');
    const toolbarLeft = document.querySelector('.toolbar-left');
    let isStreamMode = false;

    // 确保元素存在才进行操作
    if (!userInput || !inputContainer || !toolbarLeft) {
        console.error("Input area elements not found, skipping initialization.");
        return;
    }

    // 创建文件预览容器
    const filePreviewContainer = document.createElement('div');
    filePreviewContainer.id = 'file-preview-container';
    filePreviewContainer.style.display = 'none'; // 初始隐藏
    inputContainer.insertBefore(filePreviewContainer, inputContainer.firstChild);

    // 初始化工具栏图标
    initializeToolbar(toolbarLeft, filePreviewContainer);

    // 输入框高度自动调整 (此处调用初始化，监听器在下面添加)
    adjustInputHeight(); // 确保初始高度正确
    userInput.addEventListener('input', adjustInputHeight); // 添加监听器

    // 添加流式响应开关按钮的点击事件
    const streamToggle = document.querySelector('.stream-toggle');
    if (streamToggle) {
        streamToggle.addEventListener('click', () => {
            isStreamMode = !isStreamMode;
            streamToggle.classList.toggle('active');
        });
    }

    // 添加发送按钮的点击事件
    const sendButton = document.querySelector('.send-button');
    if (sendButton) {
        sendButton.addEventListener('click', () => handleSendMessage(userInput, sendButton, filePreviewContainer, displayMessage, isStreamMode));
    }

    // 添加键盘事件监听
    userInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage(userInput, sendButton, filePreviewContainer, displayMessage, isStreamMode);
        }
    });
}

// 初始化工具栏
function initializeToolbar(toolbarLeft, filePreviewContainer) {
    const tools = ['image', 'document', 'code', 'audio', 'video'].map(type => {
        const icon = document.createElement('button');
        icon.className = 'toolbar-icon';
        icon.type = 'button';
        icon.setAttribute('data-type', type);
        
        const tooltip = document.createElement('span');
        tooltip.className = 'tooltip';
        tooltip.textContent = tooltipTexts[type];
        
        icon.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            ${getIconPath(type)}
        </svg>`;
        
        icon.appendChild(tooltip);
        return icon;
    });

    tools.forEach(icon => {
        toolbarLeft.appendChild(icon);
        icon.addEventListener('click', () => handleToolClick(icon.getAttribute('data-type'), filePreviewContainer));
    });
}

// 处理工具按钮点击
function handleToolClick(type, filePreviewContainer) {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = fileTypeMap[type];
    fileInput.multiple = true;
    
    fileInput.click();
    
    fileInput.addEventListener('change', (e) => {
        const files = Array.from(e.target.files);
        files.forEach(file => {
            selectedFiles.push(file);
            const fileName = file.name;
            const fileExt = fileName.substring(fileName.lastIndexOf('.'));
            const fileNameWithoutExt = fileName.substring(0, fileName.lastIndexOf('.'));
            const maxLength = 16;
            const displayName = fileNameWithoutExt.length > maxLength - fileExt.length
                ? fileNameWithoutExt.substring(0, maxLength - fileExt.length) + '...' + fileExt
                : fileName;
            
            const previewItem = document.createElement('div');
            previewItem.className = 'preview-item';
            previewItem.dataset.fileName = fileName;
            
            if (type === 'image') {
                const img = document.createElement('img');
                img.src = URL.createObjectURL(file);
                previewItem.appendChild(img);
            } else {
                const fileNameDiv = document.createElement('div');
                fileNameDiv.className = 'file-name';
                fileNameDiv.textContent = displayName;
                previewItem.appendChild(fileNameDiv);
            }
            
            const removeButton = document.createElement('div');
            removeButton.className = 'remove-file';
            removeButton.innerHTML = '×';
            removeButton.addEventListener('click', () => {
                selectedFiles = selectedFiles.filter(f => f.name !== file.name);
                previewItem.remove();
                if (selectedFiles.length === 0) {
                    filePreviewContainer.style.display = 'none';
                }
            });
            previewItem.appendChild(removeButton);
            
            filePreviewContainer.appendChild(previewItem);
            filePreviewContainer.style.display = 'flex';
        });
    });
}

// 处理发送消息
async function handleSendMessage(userInput, sendButton, filePreviewContainer, displayMessage, isStreamMode) {
    const messageText = userInput.value.trim();
    const chatDisplay = document.getElementById('chat-display');
    if (!chatDisplay) {
        console.error('聊天显示区域未找到');
        return;
    }
    
    if (currentController) {
        currentController.abort();
        currentController = null;
        sendButton.innerHTML = getSendButtonSvg();
        return;
    }
    
    if (messageText || selectedFiles.length > 0) {
        const modelSelect = document.getElementById('model-select');
        const apiKey = modelSelect.getAttribute('data-apikey');

        if (!apiKey || apiKey.trim() === '') {
            alert('请在设置中输入有效的API Key！');
            const loadingAnimation = chatDisplay.lastChild;
            if (loadingAnimation && loadingAnimation.classList.contains('ai')) {
                loadingAnimation.remove();
            }
            return;
        }

        displayMessage({
            type: 'user',
            content: messageText,
            files: selectedFiles
        }, chatDisplay);

        const selectedModel = modelSelect.value;
        
        const formData = new FormData();
        formData.append('model', selectedModel);
        formData.append('apikey', apiKey);
        formData.append('input', messageText);
        formData.append('stream', isStreamMode.toString());
        if (currentChatId) {
            formData.append('chatId', currentChatId.toString());
        }

        selectedFiles.forEach((file, index) => {
            formData.append(`file${index}`, file);
        });

        userInput.value = ''; // 清空输入框
        adjustInputHeight(); // 调整高度以匹配清空后的内容
        filePreviewContainer.innerHTML = '';
        selectedFiles = [];
        filePreviewContainer.style.display = 'none';
        
        currentController = new AbortController();
        sendButton.innerHTML = getStopButtonSvg();

        const aiMessageElement = document.createElement('div');
        aiMessageElement.classList.add('message', 'ai');
        
        const loadingElement = document.createElement('div');
        loadingElement.classList.add('loading-animation');
        loadingElement.innerHTML = '<div class="dot-pulse"></div>';
        aiMessageElement.appendChild(loadingElement);
        chatDisplay.appendChild(aiMessageElement);
        chatDisplay.scrollTop = chatDisplay.scrollHeight;

        try {
            const response = await fetch('/chat', { // Endpoint should be /chat
                method: 'POST',
                signal: currentController.signal,
                body: formData
            });

            if (!response.ok) {
                let errorText = await response.text();
                try {
                    const errorJson = JSON.parse(errorText);
                    errorText = errorJson.message || JSON.stringify(errorJson, null, 2);
                } catch (e) {
                    // Not JSON, use raw text
                }
                throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
            }

            loadingElement.remove();

            if (isStreamMode) {
                const chatIdHeader = response.headers.get('X-Chat-ID');
                if (chatIdHeader) {
                    currentChatId = parseInt(chatIdHeader, 10);
                    console.log('从流式响应头中获取到chatId:', currentChatId);
                }
                await handleStreamResponse(response, aiMessageElement, chatDisplay);
            } else {
                const result = await response.json();
                if (result && result.chatId) {
                    currentChatId = result.chatId;
                    console.log('从非流式响应体中获取到chatId:', currentChatId);
                }
                await handleNormalResponse(result.response, aiMessageElement, chatDisplay);
            }

        } catch (error) {
            console.error('获取AI响应时出错:', error);
            if (error.name !== 'AbortError') {
                loadingElement.remove();
                aiMessageElement.innerHTML = '';
                displayMessage({
                    type: 'ai',
                    content: `发生错误: ${error.message}`
                }, chatDisplay);
            }
        } finally {
            currentController = null;
            sendButton.innerHTML = getSendButtonSvg();
            // userInput.value = ''; // 已经在开始处理时清空
            // adjustInputHeight(); // 已经在开始处理时调整
        }
    }
}

// 处理流式响应
async function handleStreamResponse(response, aiMessageElement, chatDisplay) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let accumulatedTextContent = '';
    let mediaAndFileElements = [];

    aiMessageElement.innerHTML = '';
    const textContainer = document.createElement('div');
    aiMessageElement.appendChild(textContainer);

    while (true) {
        const {value, done} = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, {stream: true});
        const lines = chunk.split('\n').filter(line => line.trim());
        
        for (const line of lines) {
            try {
                const parts = JSON.parse(line);
                parts.forEach(part => {
                    if (part.text) {
                        accumulatedTextContent += part.text;
                    } else if (part.inlineData) {
                        const imgElement = document.createElement('img');
                        imgElement.src = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
                        imgElement.alt = 'Generated Image';
                        imgElement.style.maxWidth = '100%';
                        imgElement.style.height = 'auto';
                        mediaAndFileElements.push(imgElement);
                    } else if (part.fileData) {
                        const mimeType = part.fileData.mimeType;
                        const uri = part.fileData.uri;

                        if (mimeType.startsWith('image/')) {
                            const imgElement = document.createElement('img');
                            imgElement.src = uri;
                            imgElement.alt = 'Uploaded Image';
                            imgElement.style.maxWidth = '100%';
                            imgElement.style.height = 'auto';
                            mediaAndFileElements.push(imgElement);
                        } else if (mimeType.startsWith('video/')) {
                            const videoElement = document.createElement('video');
                            videoElement.src = uri;
                            videoElement.controls = true;
                            videoElement.style.maxWidth = '100%';
                            videoElement.style.height = 'auto';
                            mediaAndFileElements.push(videoElement);
                        } else if (mimeType.startsWith('audio/')) {
                            const audioElement = document.createElement('audio');
                            audioElement.src = uri;
                            audioElement.controls = true;
                            audioElement.style.maxWidth = '100%';
                            mediaAndFileElements.push(audioElement);
                        } else {
                            const fileLinkDiv = document.createElement('div');
                            fileLinkDiv.classList.add('message-displayed-file');
                            const fileName = uri.substring(uri.lastIndexOf('/') + 1) || '文件';
                            const cleanFileName = fileName.split('?')[0].split('#')[0];
                            const fileIconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="file-icon">
                                <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
                                <polyline points="13 2 13 9 20 9"></polyline>
                            </svg>`;
                            fileLinkDiv.innerHTML = `${fileIconSvg} <a href="${uri}" target="_blank" rel="noopener noreferrer">${cleanFileName} (${mimeType})</a>`;
                            mediaAndFileElements.push(fileLinkDiv);
                        }
                    }
                });
            } catch (e) {
                console.error('Error parsing JSON chunk in stream:', e);
            }
        }
        
        if (accumulatedTextContent) {
            textContainer.innerHTML = marked.parse(accumulatedTextContent);
        }

        aiMessageElement.querySelectorAll('img, video, audio, .message-displayed-file').forEach(el => el.remove());
        mediaAndFileElements.forEach(el => aiMessageElement.appendChild(el));
        
        chatDisplay.scrollTop = chatDisplay.scrollHeight;
    }
}

// 处理普通响应
async function handleNormalResponse(parts, aiMessageElement, chatDisplay) {
    aiMessageElement.innerHTML = '';

    if (Array.isArray(parts)) {
        let textContent = '';
        parts.forEach(part => {
            if (part.text) {
                textContent += part.text;
            } else if (part.inlineData) {
                const imgElement = document.createElement('img');
                imgElement.src = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
                imgElement.alt = 'Generated Image';
                imgElement.style.maxWidth = '100%';
                imgElement.style.height = 'auto';
                aiMessageElement.appendChild(imgElement);
            } else if (part.fileData) {
                const mimeType = part.fileData.mimeType;
                const uri = part.fileData.uri;

                if (mimeType.startsWith('image/')) {
                    const imgElement = document.createElement('img');
                    imgElement.src = uri;
                    imgElement.alt = 'Uploaded Image';
                    imgElement.style.maxWidth = '100%';
                    imgElement.style.height = 'auto';
                    aiMessageElement.appendChild(imgElement);
                } else if (mimeType.startsWith('video/')) {
                    const videoElement = document.createElement('video');
                    videoElement.src = uri;
                    videoElement.controls = true;
                    videoElement.style.maxWidth = '100%';
                    videoElement.style.height = 'auto';
                    aiMessageElement.appendChild(videoElement);
                } else if (mimeType.startsWith('audio/')) {
                    const audioElement = document.createElement('audio');
                    audioElement.src = uri;
                    audioElement.controls = true;
                    audioElement.style.maxWidth = '100%';
                    aiMessageElement.appendChild(audioElement);
                } else {
                    const fileLinkDiv = document.createElement('div');
                    fileLinkDiv.classList.add('message-displayed-file');
                    const fileName = uri.substring(uri.lastIndexOf('/') + 1) || '文件';
                    const cleanFileName = fileName.split('?')[0].split('#')[0];
                    const fileIconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="file-icon">
                        <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
                        <polyline points="13 2 13 9 20 9"></polyline>
                    </svg>`;
                    fileLinkDiv.innerHTML = `${fileIconSvg} <a href="${uri}" target="_blank" rel="noopener noreferrer">${cleanFileName} (${mimeType})</a>`;
                    aiMessageElement.appendChild(fileLinkDiv);
                }
            }
        });
        if (textContent) {
            const textDiv = document.createElement('div');
            textDiv.innerHTML = marked.parse(textContent);
            aiMessageElement.prepend(textDiv);
        }
    } else {
        aiMessageElement.innerHTML = marked.parse(parts.toString());
    }

    chatDisplay.scrollTop = chatDisplay.scrollHeight;
}

// 获取SVG图标路径
function getIconPath(type) {
    const paths = {
        image: '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>',
        document: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/>',
        code: '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>',
        audio: '<path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/>',
        video: '<polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>'
    };
    return paths[type] || '';
}

// 获取发送按钮SVG
function getSendButtonSvg() {
    return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="22" y1="2" x2="11" y2="13"></line>
        <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
    </svg>`;
}

// 获取停止按钮SVG
function getStopButtonSvg() {
    return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <rect x="8" y="8" width="8" height="8"></rect>
    </svg>`;
}
