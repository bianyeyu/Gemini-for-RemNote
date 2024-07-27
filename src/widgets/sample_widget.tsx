import { usePlugin, renderWidget, useTracker } from '@remnote/plugin-sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import '../markdown-styles.css';

interface ChatMessage {
  role: 'user' | 'model';
  parts: Array<{ text?: string, inline_data?: { mime_type: string, data: string } }>;
  isSystemPrompt?: boolean;
}

export const SampleWidget = () => {
  const plugin = usePlugin();
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [userInput, setUserInput] = useState('');
  const [tokenCount, setTokenCount] = useState(0);
  const [generatingResponse, setGeneratingResponse] = useState(false);
  const apiKey = useTracker(() =>
    plugin.settings.getSetting<string>('gemini-api-key'),
  );
  const geminiModel = useTracker(() =>
    plugin.settings.getSetting<string>('gemini-model'),
  );
  const systemInstructions = useTracker(() =>
    plugin.settings.getSetting<string>('system-instructions'),
  );

  const chatHistoryContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    initializeChat();
  }, [systemInstructions]);

  const initializeChat = () => {
    if (systemInstructions) {
      setChatHistory([{ role: 'user', parts: [{ text: systemInstructions }], isSystemPrompt: true }]);
    } else {
      setChatHistory([]);
    }
  };

  const countConversationTokens = async (): Promise<number> => {
    if (!apiKey) return 0;
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: geminiModel || 'gemini-1.5-pro' });
  
    const messagesToCount = chatHistory.map(msg => ({ role: msg.role, parts: msg.parts }));
    messagesToCount.push({ role: 'user', parts: [{ text: userInput }] });
  
    const { totalTokens } = await model.countTokens({ contents: messagesToCount });
    return totalTokens;
  };

  useEffect(() => {
    const updateTokenCount = async () => {
      const count = await countConversationTokens();
      setTokenCount(count);
    };
    updateTokenCount();
  }, [chatHistory, userInput, apiKey, geminiModel]);

  useEffect(() => {
    const bottomIconBar = document.getElementById('bottom-icon-bar');
    if (bottomIconBar && chatHistoryContainerRef.current) {
      const bottomIconBarHeight = bottomIconBar.offsetHeight;
      chatHistoryContainerRef.current.style.marginBottom = `${bottomIconBarHeight}px`;
    }
  }, []);

  const handleClearChat = () => {
    initializeChat();
  };

  const handleSaveChat = () => {
    if (chatHistory.length === 0) {
      plugin.app.toast('Chat history is empty!');
      return;
    }

    let chatText = '';
    chatHistory.forEach((message) => {
      chatText += `${message.isSystemPrompt ? 'SYSTEM' : message.role.toUpperCase()}: `;
      message.parts.forEach((part) => {
        if (part.text) {
          chatText += part.text;
        }
        if (part.inline_data) {
          chatText += `[${part.inline_data.mime_type.split('/')[0]}]`;
        }
      });
      chatText += '\n';
    });

    const blob = new Blob([chatText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'gemini-chat.txt';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    plugin.app.toast('Chat history saved!');
  };

  
  const handleUserInput = async (inputParts: Array<{ text?: string, inline_data?: { mime_type: string, data: string } }> = []) => {
    if (inputParts.length === 0 && !userInput.trim()) return;

    if (!apiKey) {
      plugin.app.toast('Please enter your Gemini API key in the settings.');
      return;
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: geminiModel || 'gemini-1.5-pro' });

    try {
      let userMessage: ChatMessage = { 
        role: 'user', 
        parts: inputParts.length > 0 ? inputParts : [{ text: userInput }]
      };

      setChatHistory((prevHistory) => [
        ...prevHistory,
        userMessage,
        { role: 'model', parts: [{ text: '' }] }, // Add an empty model message for streaming
      ]);
      setGeneratingResponse(true);
      setUserInput('');
      
      let messages: ChatMessage[] = [...chatHistory, userMessage];

      // Ensure the system prompt is always the first message
      const systemPrompt = messages.find(msg => msg.isSystemPrompt);
      if (systemPrompt) {
        messages = [systemPrompt, ...messages.filter(msg => !msg.isSystemPrompt)];
      }

      const result = await model.generateContentStream({
        contents: messages.map(msg => ({ role: msg.role, parts: msg.parts })),
        generationConfig: {
          maxOutputTokens: 1000,
        },
      });

      let streamedText = '';
      for await (const chunk of result.stream) {
        const chunkText = chunk.text();
        streamedText += chunkText;

        setChatHistory((prevHistory) => {
          const lastMessage = prevHistory[prevHistory.length - 1];
          if (lastMessage.role === 'model') {
            return [
              ...prevHistory.slice(0, -1), 
              { ...lastMessage, parts: [{ text: streamedText }] }
            ];
          } else {
            return prevHistory;
          }
        });
      }

      setGeneratingResponse(false);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      plugin.app.toast(`Error communicating with Gemini API: ${errorMessage}`);
      console.error('Gemini API Error:', error);
      setGeneratingResponse(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB

    const filePromises = Array.from(files).map(file => {
      if (file.size > MAX_FILE_SIZE) {
        plugin.app.toast(`File ${file.name} exceeds 15MB limit and will be skipped.`);
        return Promise.resolve(null);
      }

      // Only process image files
      if (!file.type.startsWith('image/')) {
        plugin.app.toast(`File ${file.name} is not an image and will be skipped.`);
        return Promise.resolve(null);
      }

      return new Promise<{ mime_type: string, data: string } | null>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = (reader.result as string).split(',')[1];
          resolve({ mime_type: file.type, data: base64 });
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    });

    try {
      const fileParts = (await Promise.all(filePromises)).filter(part => part !== null) as Array<{ mime_type: string, data: string }>;
      if (fileParts.length > 0) {
        const inputParts = [
          ...fileParts.map(part => ({ inline_data: part })),
          { text: userInput || "Please describe this image." }
        ];
        handleUserInput(inputParts);
      } else {
        plugin.app.toast('No valid images were uploaded.');
      }
    } catch (error) {
      plugin.app.toast('Error processing files. Please try again or use smaller files.');
      console.error('File processing error:', error);
    }
  };

  return (
    <div className="p-2 m-2 rounded-lg flex flex-col justify-end h-full">
      <h1 className="text-xl font-bold text-center mb-4">Gemini for RemNote</h1>

      <div className="text-sm text-gray-600 mb-2">
        Token Count: {tokenCount}
      </div>

      <div 
        className="flex-grow overflow-y-auto mb-4" 
        ref={chatHistoryContainerRef} 
      > 
       <div className="chat-history">
        {chatHistory.map((message, index) => (
          <div
            key={index}
            className={`p-3 mb-1 rounded-lg bg-white text-gray-800 ${
              message.role === 'user'
                ? ' self-end'
                : ' self-start'
            }`}
          >
            <p className="text-sm font-bold">
              <strong>{message.isSystemPrompt ? 'System Prompts' : message.role === 'user' ? 'You' : 'Gemini'}</strong>
            </p>
            {message.parts.map((part, partIndex) => (
              <div key={partIndex}>
                {part.text && (
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{part.text}</ReactMarkdown>
                )}
                {part.inline_data && (
                  part.inline_data.mime_type.startsWith('image/') ? (
                    <img 
                      src={`data:${part.inline_data.mime_type};base64,${part.inline_data.data}`} 
                      alt="Uploaded content" 
                      className="max-w-full h-auto" 
                    />
                  ) : (
                    <p>Unsupported file type: {part.inline_data.mime_type}</p>
                  )
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
      </div>
      <div className="flex flex-col mb-4">  
        <textarea 
          className="w-full p-2 border rounded-lg mb-2 resize-none" 
          rows={4} 
          placeholder="Type your message..."
          value={userInput}
          onChange={(e) => setUserInput(e.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              handleUserInput();
            }
          }}
        />
        <div className="flex" id="bottom-icon-bar">
          <button className="bg-blue-500 text-black px-3 py-2 rounded-lg mr-2" onClick={() => handleUserInput()}>
            ➤
          </button>
          <button className="bg-green-500 text-black px-3 py-2 rounded-lg mr-2" onClick={() => fileInputRef.current?.click()}>
            +
          </button>
          <input
            type="file"
            ref={fileInputRef}
            style={{ display: 'none' }}
            onChange={handleFileUpload}
            accept="image/*"
            multiple
          />
          <button className="text-gray-500 hover:text-gray-700 px-3 py-2 rounded-lg mr-2" onClick={handleClearChat}>
            🗑️
          </button>
          <button className="text-gray-500 hover:text-gray-700 px-3 py-2 rounded-lg" onClick={handleSaveChat}>
            💾
          </button>
        </div>
      </div>
    </div>
  );
};

renderWidget(SampleWidget);