// src/routes/chat.route.ts

import { processAIRequest, parseFormDataToContents } from "../services/ai.service.ts";
import { Content, Part } from "npm:@google/genai";

const decoder = new TextDecoder();

export async function handleChatRequest(req: Request): Promise<Response> {

  if (req.method === "POST") {
    try {
      const url = new URL(req.url);
      const pathname = url.pathname;
      
      // 添加调试日志
      console.log('=== 请求调试信息 ===');
      console.log('URL:', req.url);
      console.log('路径:', pathname);
      console.log('查询参数:', Object.fromEntries(url.searchParams));
      console.log('请求头:', Object.fromEntries(req.headers));
      
      // 检查是否是Google AI API格式的请求
      const isGoogleAPIFormat = pathname.includes("/v1beta/models/");
      
      let model: string | undefined;
      let apikey: string | undefined;
      let messageText = '';
      let streamEnabled = false;
      let userContentParts: Part[] = [];
      
      if (isGoogleAPIFormat) {
        // 处理Google AI API格式的JSON请求
        const jsonBody = await req.json();
        
        // 从URL路径中提取模型名称
        const modelMatch = pathname.match(/\/v1beta\/models\/([^:]+)/);
        model = modelMatch ? modelMatch[1] : undefined;
        

        // 从查询参数或头部获取API密钥
        apikey = url.searchParams.get('key') || 
                 req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || 
                 req.headers.get('x-api-key') ||
                 req.headers.get('x-goog-api-key');
        
        // 检查是否是流式请求
        streamEnabled = pathname.includes(':streamGenerateContent');
        
        // 解析Google AI API格式的内容
        if (jsonBody.contents && Array.isArray(jsonBody.contents)) {
          const lastContent = jsonBody.contents[jsonBody.contents.length - 1];
          if (lastContent && lastContent.parts) {
            userContentParts = lastContent.parts;
            // 提取文本内容用于日志
            const textPart = lastContent.parts.find((part: any) => part.text);
            if (textPart) {
              messageText = textPart.text;
            }
          }
        }
      } else {
        // 处理原有的FormData格式请求
        const formData = await req.formData();
        model = formData.get('model')?.toString();
        apikey = formData.get('apikey')?.toString();
        messageText = formData.get('input')?.toString() || '';
        streamEnabled = formData.get('stream') === 'true';
        
        userContentParts = await parseFormDataToContents(formData, messageText, apikey || '');
      }

      // 添加调试日志显示解析结果
      console.log('解析结果:');
      console.log('模型:', model);
      console.log('API密钥:', apikey ? `${apikey.substring(0, 10)}...` : 'undefined');
      console.log('是否Google API格式:', isGoogleAPIFormat);

      if (!model || !apikey) {
        console.log('错误: 缺少模型或API密钥');
        return new Response("请求体中缺少模型或API密钥", { status: 400 });
      }
      
      if (userContentParts.length === 0) {
        if (!messageText.trim()) {
             return new Response("请输入消息或上传文件。", { status: 400 });
        }
      }

      // 直接使用当前用户消息，不保存历史记录
      const fullAiContents: Content[] = [{
        role: "user",
        parts: userContentParts
      }];

      let mimeTypesForOtherModels: string[] = []; 
      if (model !== 'gemini-2.0-flash-preview-image-generation') {
        // 如果有其他模型需要特定MIME类型，可以在这里设置
        console.log(`模型 ${model} 使用默认响应类型或由 processAIRequest 内部的 _requestedResponseMimeTypes (如果提供) 决定。`);
      } else {
        // 对于图像生成模型，processAIRequest 内部会处理其特殊的 config.responseModalities
        console.log(`为图像生成模型 ${model} 调用 processAIRequest，不在此处传递特定MIME类型列表。`);
      }


      
      const aiResponse = await processAIRequest(
        model,
        apikey,
        fullAiContents,
        streamEnabled,
        mimeTypesForOtherModels // 这个参数对于图像生成模型会被 processAIRequest 内部逻辑覆盖或忽略
      );
      
      // ... (后续的流式和非流式响应处理逻辑保持不变) ...
       if (streamEnabled) {
        const encoder = new TextEncoder();
        const url = new URL(req.url);
        const isSSE = url.searchParams.get('alt') === 'sse';
        
        const responseBody = new ReadableStream({
          async start(controller) {
            const reader = (aiResponse as ReadableStream<Uint8Array>).getReader();
            let buffer = '';
            try {
              while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';
                for (const line of lines) {
                  if (line.trim()) {
                    try {
                      const partsInChunk: Part[] = JSON.parse(line);
                      if (isSSE) {
                        // SSE格式：包装为OpenAI兼容格式
                        const content = partsInChunk.map(part => part.text || '').join('');
                        if (content) {
                          const openAIFormat = {
                            id: `chatcmpl-${Date.now()}`,
                            object: "chat.completion.chunk",
                            created: Math.floor(Date.now() / 1000),
                            model: model,
                            choices: [{
                              index: 0,
                              delta: {
                                role: "assistant",
                                content: content
                              },
                              finish_reason: null
                            }]
                          };
                          const sseData = `data: ${JSON.stringify(openAIFormat)}\n\n`;
                          console.log('发送SSE数据块:', JSON.stringify(openAIFormat, null, 2));
                          controller.enqueue(encoder.encode(sseData));
                        }
                      } else {
                        // NDJSON格式
                        controller.enqueue(encoder.encode(line + '\n'));
                      }
                    } catch (e) {
                      console.error('解析AI流式响应JSON块时出错:', e, '原始行:', line);
                    }
                  }
                }
              }
              if (buffer.trim()) {
                try {
                  const partsInChunk: Part[] = JSON.parse(buffer);
                  if (isSSE) {
                    // SSE格式：包装为OpenAI兼容格式
                    const content = partsInChunk.map(part => part.text || '').join('');
                    if (content) {
                      const openAIFormat = {
                        id: `chatcmpl-${Date.now()}`,
                        object: "chat.completion.chunk",
                        created: Math.floor(Date.now() / 1000),
                        model: model,
                        choices: [{
                          index: 0,
                          delta: {
                            role: "assistant",
                            content: content
                          },
                          finish_reason: null
                        }]
                      };
                      const sseData = `data: ${JSON.stringify(openAIFormat)}\n\n`;
                      console.log('发送SSE最终缓冲数据块:', JSON.stringify(openAIFormat, null, 2));
                      controller.enqueue(encoder.encode(sseData));
                    }
                  } else {
                    controller.enqueue(encoder.encode(buffer + '\n'));
                  }
                } catch (e) {
                  console.error('解析AI流式响应最终缓冲时出错:', e, '原始缓冲:', buffer);
                }
              }
              
              // SSE格式需要发送结束标记
              if (isSSE) {
                const finalChunk = {
                  id: `chatcmpl-${Date.now()}`,
                  object: "chat.completion.chunk",
                  created: Math.floor(Date.now() / 1000),
                  model: model,
                  choices: [{
                    index: 0,
                    delta: {},
                    finish_reason: "stop"
                  }]
                };
                console.log('发送SSE结束标记:', JSON.stringify(finalChunk, null, 2));
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(finalChunk)}\n\n`));
              }
            } catch (error) {
              console.error("AI流式响应处理过程中发生错误:", error);
              controller.error(error);
            } finally {
              controller.close();
            }
          }
        });

        return new Response(responseBody, {
          headers: {
            'Content-Type': isSSE ? 'text/event-stream' : 'application/x-ndjson',
            'Transfer-Encoding': 'chunked',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
          }
        });

      } else { // 非流式
        const aiMessageParts = aiResponse as Part[];
        return new Response(JSON.stringify({ response: aiMessageParts }), {
          headers: { "Content-Type": "application/json" },
        });
      }

    } catch (error) {
      console.error("处理聊天请求时发生错误:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      return new Response(`处理聊天消息时出错: ${errorMessage}`, { status: 500 });
    }
  }
  return new Response("未找到或方法不允许", { status: 404 });
}
