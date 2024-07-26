import { usePlugin, renderWidget, useTracker } from '@remnote/plugin-sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import '../markdown-styles.css';

interface ChatMessage {
  role: 'user' | 'model';
  parts: Array<{ text?: string, inline_data?: { mime_type: string, data: string } }>;
}

export const SampleWidget = () => {
  const plugin = usePlugin();
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [userInput, setUserInput] = useState('');
  const [tokenCount, setTokenCount] = useState(0);
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

  const countConversationTokens = async (): Promise<number> => {
    if (!apiKey) return 0;
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: geminiModel || 'gemini-1.5-pro' });
  
    let messages = [...chatHistory];
    if (systemInstructions) {
      messages.unshift({ role: 'user', parts: [{ text: systemInstructions }] });
    }
  
    const messagesToCount = [...messages, { role: 'user', parts: [{ text: userInput }] }];
  
    const { totalTokens } = await model.countTokens({ contents: messagesToCount });
    return totalTokens;
  };

  useEffect(() => {
    const updateTokenCount = async () => {
      const count = await countConversationTokens();
      setTokenCount(count);
    };
    updateTokenCount();
  }, [chatHistory, userInput, apiKey, geminiModel, systemInstructions]);

  useEffect(() => {
    const bottomIconBar = document.getElementById('bottom-icon-bar');
    if (bottomIconBar && chatHistoryContainerRef.current) {
      const bottomIconBarHeight = bottomIconBar.offsetHeight;
      chatHistoryContainerRef.current.style.marginBottom = `${bottomIconBarHeight}px`;
    }
  }, []);

  const handleClearChat = () => {
    setChatHistory([]);
  };

  const handleSaveChat = () => {
    if (chatHistory.length === 0) {
      plugin.app.toast('Chat history is empty!');
      return;
    }

    let chatText = '';
    chatHistory.forEach((message) => {
      chatText += `${message.role.toUpperCase()}: `;
      message.parts.forEach((part) => {
        if (part.text) {
          chatText += part.text;
        }
        if (part.inline_data) {
          chatText += `[Image: ${part.inline_data.mime_type}]`;
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

  const handleUserInput = async (inputParts: Array<{ text?: string, inline_data?: { mime_type: string, data: string } }> = [{ text: userInput }]) => {
    if (inputParts.length === 0 || (inputParts.length === 1 && !inputParts[0].text && !inputParts[0].inline_data)) return;

    if (!apiKey) {
      plugin.app.toast('Please enter your Gemini API key in the settings.');
      return;
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: geminiModel || 'gemini-1.5-pro' });

    try {
      let userMessage: ChatMessage = { role: 'user', parts: inputParts };
      
      let messages: ChatMessage[] = [...chatHistory];
      if (systemInstructions && messages.length === 0) {
        messages.unshift({ role: 'user', parts: [{ text: systemInstructions }] });
      }
      messages.push(userMessage);

      const result = await model.generateContent({
        contents: messages,
        generationConfig: {
          maxOutputTokens: 1000,
        },
      });

      const response = await result.response;
      const text = response.text();

      setChatHistory((prevHistory) => [
        ...prevHistory,
        userMessage,
        { role: 'model', parts: [{ text: text }] },
      ]);

      setUserInput('');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      plugin.app.toast(`Error communicating with Gemini API: ${errorMessage}`);
      console.error('Gemini API Error:', error);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = (reader.result as string).split(',')[1]; // Remove the data URL prefix
        handleUserInput([
          { 
            inline_data: { 
              mime_type: file.type, 
              data: base64 
            } 
          },
          { text: userInput }
        ]);
      };
      reader.readAsDataURL(file);
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
            <strong>{message.role === 'user' ? 'You' : 'Gemini'}</strong>
          </p>
          {message.parts.map((part, partIndex) => (
            <div key={partIndex}>
              {part.text && (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{part.text}</ReactMarkdown>
              )}
              {part.inline_data && (
                <img 
                  src={`data:${part.inline_data.mime_type};base64,${part.inline_data.data}`} 
                  alt="Uploaded content" 
                  className="max-w-full h-auto" 
                />
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