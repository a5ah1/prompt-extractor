const dropZone = document.getElementById('dropZone');
const dropText = document.getElementById('dropText');
const preview = document.getElementById('preview');
const fileInput = document.getElementById('fileInput');
const fileInfo = document.getElementById('fileInfo');
const promptsPanel = document.getElementById('promptsPanel');
const jsonContent = document.getElementById('jsonContent');
const downloadBtn = document.getElementById('downloadBtn');
const copyJsonBtn = document.getElementById('copyJsonBtn');
const infoBtn = document.getElementById('infoBtn');
const aboutModal = document.getElementById('aboutModal');
const modalClose = document.getElementById('modalClose');

let currentWorkflow = null;
let currentFileName = 'workflow';

// Modal handlers
infoBtn.addEventListener('click', () => {
  aboutModal.classList.add('open');
});

modalClose.addEventListener('click', () => {
  aboutModal.classList.remove('open');
});

aboutModal.addEventListener('click', (e) => {
  if (e.target === aboutModal) {
    aboutModal.classList.remove('open');
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && aboutModal.classList.contains('open')) {
    aboutModal.classList.remove('open');
  }
});

// Click to open file dialog
dropZone.addEventListener('click', () => fileInput.click());

// File input change
fileInput.addEventListener('change', (e) => {
  if (e.target.files.length > 0) {
    handleFile(e.target.files[0]);
  }
});

// Drag and drop handlers
dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('drag-over');
});

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');

  const files = e.dataTransfer.files;
  if (files.length > 0) {
    handleFile(files[0]);
  }
});

// Download button
downloadBtn.addEventListener('click', () => {
  if (!currentWorkflow) return;

  const blob = new Blob([JSON.stringify(currentWorkflow, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${currentFileName}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

copyJsonBtn.addEventListener('click', () => {
  if (!currentWorkflow) return;

  navigator.clipboard.writeText(JSON.stringify(currentWorkflow, null, 2)).then(() => {
    copyJsonBtn.textContent = 'Copied!';
    copyJsonBtn.classList.add('copied');
    setTimeout(() => {
      copyJsonBtn.textContent = 'Copy';
      copyJsonBtn.classList.remove('copied');
    }, 1500);
  });
});

async function handleFile(file) {
  // Validate file type
  if (!file.type.match(/image\/(jpe?g|png|webp)/)) {
    showError('Please select a JPEG, PNG, or WEBP image file.');
    return;
  }

  currentFileName = file.name.replace(/\.[^/.]+$/, '');

  // Show preview
  const url = URL.createObjectURL(file);
  preview.src = url;
  preview.style.display = 'block';
  dropText.style.display = 'none';
  dropZone.classList.add('has-image');

  // Show filename
  fileInfo.textContent = file.name;
  fileInfo.style.display = 'block';

  // Extract metadata
  try {
    // Read file as ArrayBuffer for manual parsing if needed
    const arrayBuffer = await file.arrayBuffer();

    let metadata = null;
    const isWebp = file.type === 'image/webp';
    const isJpeg = file.type === 'image/jpeg';
    const isPng = file.type === 'image/png';

    if (isWebp) {
      // exifr doesn't support WEBP, extract EXIF manually
      metadata = extractWebpExif(arrayBuffer);
    } else if (isJpeg) {
      // For JPEG, use exifr with 'true' to get all data including userComment
      metadata = await exifr.parse(arrayBuffer, true);
    } else {
      // For PNG, use standard parsing
      metadata = await exifr.parse(arrayBuffer, {
        tiff: true,
        xmp: true,
        icc: false,
        iptc: false,
        translateKeys: true,
        translateValues: true,
        mergeOutput: true
      });
    }

    if (!metadata) {
      showError('No metadata found in image.');
      return;
    }

    // Detect source and extract data
    const result = detectAndExtract(metadata, { isJpeg, isPng, isWebp });

    if (!result) {
      showError('No generation data found. This may not be a ComfyUI or A1111 image.');
      return;
    }

    // Update UI based on source type
    if (result.source === 'comfyui') {
      currentWorkflow = result.workflow;
      displayComfyUIData(result);
      jsonContent.textContent = JSON.stringify(result.workflow, null, 2);
      jsonContent.classList.remove('empty');
      downloadBtn.disabled = false;
      copyJsonBtn.disabled = false;
    } else if (result.source === 'a1111') {
      currentWorkflow = null;
      displayA1111Data(result);
      jsonContent.textContent = 'A1111 images do not contain workflow JSON';
      jsonContent.classList.add('empty');
      downloadBtn.disabled = true;
      copyJsonBtn.disabled = true;
    }

  } catch (err) {
    console.error(err);
    showError(`Error parsing metadata: ${err.message}`);
  }
}

function detectAndExtract(metadata, fileInfo = {}) {
  // Get the text content from metadata based on file type
  let textContent = null;

  // For PNG: parameters field contains the text directly
  if (fileInfo.isPng && metadata.parameters) {
    textContent = metadata.parameters;
  }
  // For JPEG/WEBP: userComment may be a Uint8Array that needs decoding
  else if (metadata.userComment) {
    textContent = decodeUserComment(metadata.userComment);
  }
  // Fallback to other common fields
  else if (metadata.ImageDescription) {
    textContent = metadata.ImageDescription;
  }
  else if (metadata.description) {
    textContent = metadata.description;
  }

  if (!textContent) {
    return null;
  }

  // Check for ComfyUI workflow
  if (textContent.includes('Workflow:')) {
    const workflowMatch = textContent.match(/Workflow:\s*(\{[\s\S]*\})/);
    if (workflowMatch) {
      const jsonStr = extractBalancedJson(workflowMatch[1]);
      if (jsonStr) {
        try {
          const workflow = JSON.parse(jsonStr);
          return {
            source: 'comfyui',
            workflow: workflow,
            prompts: extractComfyUIPrompts(workflow)
          };
        } catch (e) {
          console.error('Failed to parse ComfyUI JSON:', e);
        }
      }
    }
  }

  // Check for A1111 format
  if (isA1111Format(textContent)) {
    return {
      source: 'a1111',
      ...parseA1111Data(textContent)
    };
  }

  return null;
}

function decodeUserComment(data) {
  // userComment can be a string, Uint8Array, or other format
  if (typeof data === 'string') {
    return data;
  }

  if (data instanceof Uint8Array || ArrayBuffer.isView(data)) {
    // Check for encoding prefix (first 8 bytes indicate encoding)
    // Common prefixes: "ASCII\0\0\0", "UNICODE\0", "JIS\0\0\0\0\0"
    const prefix = new TextDecoder('ascii').decode(data.slice(0, 8));

    if (prefix.startsWith('UNICODE')) {
      // UTF-16 Big Endian encoding, skip the 8-byte prefix
      const textData = data.slice(8);
      // Decode as UTF-16 BE
      let result = '';
      for (let i = 0; i < textData.length - 1; i += 2) {
        const charCode = (textData[i] << 8) | textData[i + 1];
        if (charCode === 0) continue; // Skip null bytes
        result += String.fromCharCode(charCode);
      }
      return result;
    } else if (prefix.startsWith('ASCII')) {
      // ASCII encoding, skip the 8-byte prefix
      return new TextDecoder('ascii').decode(data.slice(8));
    } else {
      // Try UTF-8 as fallback
      return new TextDecoder('utf-8').decode(data);
    }
  }

  return null;
}

function extractWebpExif(arrayBuffer) {
  // WEBP files store EXIF in a RIFF chunk named 'EXIF'
  const data = new Uint8Array(arrayBuffer);

  // Verify RIFF/WEBP header
  const riff = String.fromCharCode(...data.slice(0, 4));
  const webp = String.fromCharCode(...data.slice(8, 12));

  if (riff !== 'RIFF' || webp !== 'WEBP') {
    return null;
  }

  // Search for EXIF chunk
  let pos = 12;
  while (pos < data.length - 8) {
    const chunkId = String.fromCharCode(...data.slice(pos, pos + 4));
    const chunkSize = data[pos + 4] | (data[pos + 5] << 8) | (data[pos + 6] << 16) | (data[pos + 7] << 24);

    if (chunkId === 'EXIF') {
      // Found EXIF chunk, parse TIFF/EXIF structure
      const exifData = data.slice(pos + 8, pos + 8 + chunkSize);
      return parseExifData(exifData);
    }

    // Move to next chunk (chunks are padded to even size)
    pos += 8 + chunkSize + (chunkSize % 2);
  }

  return null;
}

function parseExifData(exifData) {
  // EXIF data starts with TIFF header
  // Byte order: 'MM' (big-endian) or 'II' (little-endian)
  const byteOrder = String.fromCharCode(exifData[0], exifData[1]);
  const isLittleEndian = byteOrder === 'II';

  function readUint16(offset) {
    if (isLittleEndian) {
      return exifData[offset] | (exifData[offset + 1] << 8);
    }
    return (exifData[offset] << 8) | exifData[offset + 1];
  }

  function readUint32(offset) {
    if (isLittleEndian) {
      return exifData[offset] | (exifData[offset + 1] << 8) |
             (exifData[offset + 2] << 16) | (exifData[offset + 3] << 24);
    }
    return (exifData[offset] << 24) | (exifData[offset + 1] << 16) |
           (exifData[offset + 2] << 8) | exifData[offset + 3];
  }

  // Verify TIFF magic number (42)
  if (readUint16(2) !== 42) {
    return null;
  }

  // Get offset to first IFD
  let ifdOffset = readUint32(4);

  // Search through IFDs for ExifIFD (tag 0x8769)
  while (ifdOffset > 0 && ifdOffset < exifData.length - 2) {
    const numEntries = readUint16(ifdOffset);
    let exifIfdOffset = 0;

    for (let i = 0; i < numEntries; i++) {
      const entryOffset = ifdOffset + 2 + (i * 12);
      const tag = readUint16(entryOffset);

      if (tag === 0x8769) {
        // ExifIFD pointer
        exifIfdOffset = readUint32(entryOffset + 8);
        break;
      }
    }

    if (exifIfdOffset > 0) {
      // Parse ExifIFD for UserComment (tag 0x9286)
      const exifNumEntries = readUint16(exifIfdOffset);

      for (let i = 0; i < exifNumEntries; i++) {
        const entryOffset = exifIfdOffset + 2 + (i * 12);
        const tag = readUint16(entryOffset);

        if (tag === 0x9286) {
          // UserComment found
          const count = readUint32(entryOffset + 4);
          let valueOffset = entryOffset + 8;

          // If data is > 4 bytes, the value is an offset
          if (count > 4) {
            valueOffset = readUint32(entryOffset + 8);
          }

          const commentData = exifData.slice(valueOffset, valueOffset + count);
          const userComment = decodeUserComment(commentData);

          return { userComment };
        }
      }
    }

    // Move to next IFD
    const nextIfdOffset = readUint32(ifdOffset + 2 + (numEntries * 12));
    if (nextIfdOffset === 0 || nextIfdOffset === ifdOffset) break;
    ifdOffset = nextIfdOffset;
  }

  return null;
}

function isA1111Format(text) {
  // A1111 format has specific patterns like "Steps:", "Sampler:", "CFG scale:"
  return /Steps:\s*\d+/.test(text) && /Sampler:/.test(text);
}

function parseA1111Data(text) {
  const result = {
    positive: '',
    negative: '',
    adetailerPositive: '',
    adetailerNegative: '',
    parameters: {}
  };

  // Split by "Negative prompt:" to get positive prompt
  const negativeIndex = text.indexOf('Negative prompt:');

  if (negativeIndex > 0) {
    result.positive = text.substring(0, negativeIndex).trim();
    text = text.substring(negativeIndex + 16); // Skip "Negative prompt:"
  }

  // Find where parameters start (first key: value pattern after negative prompt)
  // Look for patterns like "Steps: " which marks start of parameters
  const paramsMatch = text.match(/\.\s*(Steps:\s*\d+)/);

  if (paramsMatch) {
    const paramsStart = text.indexOf(paramsMatch[1]);
    result.negative = text.substring(0, paramsStart).trim();
    // Remove trailing period if present
    if (result.negative.endsWith('.')) {
      result.negative = result.negative.slice(0, -1);
    }

    const paramsText = text.substring(paramsStart);

    // Parse key: value pairs
    // Handle special cases for ADetailer prompts which can contain commas
    const paramRegex = /([A-Za-z0-9_ ]+):\s*([^,]+(?:,(?![A-Za-z0-9_ ]+:)[^,]*)*)/g;
    let match;

    while ((match = paramRegex.exec(paramsText)) !== null) {
      const key = match[1].trim();
      const value = match[2].trim();

      if (key === 'ADetailer prompt') {
        result.adetailerPositive = value;
      } else if (key === 'ADetailer negative prompt') {
        result.adetailerNegative = value;
      } else {
        result.parameters[key] = value;
      }
    }
  } else {
    // No clear parameter section, treat rest as negative prompt
    result.negative = text.trim();
  }

  return result;
}

function extractComfyUIPrompts(workflow) {
  const prompts = {
    clipTextEncode: [],
    fluxPrompts: [],
    faceDetailer: []
  };

  const nodes = workflow.nodes || [];
  const links = workflow.links || [];

  // Build a map of link_id -> [source_node_id, source_slot, dest_node_id, dest_slot]
  const linkMap = {};
  for (const link of links) {
    // link format: [link_id, source_node_id, source_slot, dest_node_id, dest_slot, type]
    linkMap[link[0]] = {
      sourceNodeId: link[1],
      sourceSlot: link[2],
      destNodeId: link[3],
      destSlot: link[4],
      type: link[5]
    };
  }

  // Find FaceDetailer nodes and trace which CLIPTextEncode nodes feed into them
  const faceDetailerInputs = new Map(); // node_id -> { positive: bool, negative: bool }

  for (const node of nodes) {
    if (node.type === 'FaceDetailer') {
      // FaceDetailer has inputs: image, model, clip, vae, positive (4), negative (5), ...
      const inputs = node.inputs || [];
      for (const input of inputs) {
        if (input.link && (input.name === 'positive' || input.name === 'negative')) {
          const linkInfo = linkMap[input.link];
          if (linkInfo) {
            const sourceNodeId = linkInfo.sourceNodeId;
            if (!faceDetailerInputs.has(sourceNodeId)) {
              faceDetailerInputs.set(sourceNodeId, { positive: false, negative: false });
            }
            faceDetailerInputs.get(sourceNodeId)[input.name] = true;
          }
        }
      }
    }
  }

  for (const node of nodes) {
    if (node.type === 'CLIPTextEncode') {
      const values = node.widgets_values || [];
      if (values.length >= 1) {
        const promptText = String(values[0]).replace(/\\"/g, '"');
        const title = node.title || '';
        const isNegative = title.toLowerCase().includes('negative');

        // Check if this node feeds into a FaceDetailer
        const fdInfo = faceDetailerInputs.get(node.id);
        if (fdInfo) {
          // This is a FaceDetailer prompt
          prompts.faceDetailer.push({
            text: promptText,
            title: title || `FaceDetailer Prompt (Node ${node.id})`,
            isNegative: fdInfo.negative && !fdInfo.positive
          });
        } else {
          // Regular prompt
          prompts.clipTextEncode.push({
            text: promptText,
            title: title || `CLIPTextEncode (Node ${node.id})`,
            isNegative: isNegative
          });
        }
      }
    } else if (node.type === 'CLIPTextEncodeFlux') {
      const values = node.widgets_values || [];
      if (values.length >= 2) {
        prompts.fluxPrompts.push({
          tags: String(values[0]).replace(/\\"/g, '"'),
          natural: String(values[1]).replace(/\\"/g, '"'),
          guidance: values[2] || null,
          title: node.title || `CLIPTextEncodeFlux (Node ${node.id})`
        });
      }
    }
  }

  return prompts;
}

function displayComfyUIData(result) {
  promptsPanel.innerHTML = '';

  const { prompts } = result;
  let hasContent = false;

  // Display FLUX prompts first (if any)
  for (const flux of prompts.fluxPrompts) {
    hasContent = true;

    // Tag-style prompt
    if (flux.tags && flux.tags.trim()) {
      addPromptSection('flux-tags', 'FLUX Tags', flux.tags);
    }

    // Natural language prompt
    if (flux.natural && flux.natural.trim()) {
      addPromptSection('flux-natural', 'FLUX Natural Language', flux.natural);
    }
  }

  // Display CLIPTextEncode prompts
  const positives = prompts.clipTextEncode.filter(p => !p.isNegative);
  const negatives = prompts.clipTextEncode.filter(p => p.isNegative);

  for (const prompt of positives) {
    if (prompt.text && prompt.text.trim()) {
      hasContent = true;
      addPromptSection('positive', prompt.title || 'Positive Prompt', prompt.text);
    }
  }

  for (const prompt of negatives) {
    if (prompt.text && prompt.text.trim()) {
      hasContent = true;
      addPromptSection('negative', prompt.title || 'Negative Prompt', prompt.text);
    }
  }

  // Display FaceDetailer prompts
  const fdPositives = prompts.faceDetailer.filter(p => !p.isNegative);
  const fdNegatives = prompts.faceDetailer.filter(p => p.isNegative);

  for (const prompt of fdPositives) {
    if (prompt.text && prompt.text.trim()) {
      hasContent = true;
      addPromptSection('facedetailer', 'FaceDetailer Positive', prompt.text);
    }
  }

  for (const prompt of fdNegatives) {
    if (prompt.text && prompt.text.trim()) {
      hasContent = true;
      addPromptSection('facedetailer', 'FaceDetailer Negative', prompt.text);
    }
  }

  // Add source badge to file info
  updateSourceBadge('comfyui');

  if (!hasContent) {
    addPromptSection('', 'No Prompts Found', 'No prompt nodes detected in workflow', true);
  }
}

function displayA1111Data(result) {
  promptsPanel.innerHTML = '';

  // Main positive prompt
  if (result.positive) {
    addPromptSection('positive', 'Positive Prompt', result.positive);
  }

  // Main negative prompt
  if (result.negative) {
    addPromptSection('negative', 'Negative Prompt', result.negative);
  }

  // ADetailer prompts
  if (result.adetailerPositive) {
    addPromptSection('adetailer', 'ADetailer Positive', result.adetailerPositive);
  }

  if (result.adetailerNegative) {
    addPromptSection('adetailer', 'ADetailer Negative', result.adetailerNegative);
  }

  // Generation parameters
  if (Object.keys(result.parameters).length > 0) {
    const paramsText = Object.entries(result.parameters)
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n');
    addPromptSection('parameters', 'Generation Parameters', paramsText);
  }

  // Add source badge
  updateSourceBadge('a1111');
}

function addPromptSection(type, title, text, isEmpty = false) {
  const section = document.createElement('div');
  section.className = `prompt-section ${type}`;

  const header = document.createElement('div');
  header.className = 'prompt-header';

  const h2 = document.createElement('h2');
  h2.textContent = title;
  header.appendChild(h2);

  if (!isEmpty) {
    const copyBtn = document.createElement('button');
    copyBtn.className = 'copy-btn';
    copyBtn.textContent = 'Copy';
    copyBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(text).then(() => {
        copyBtn.textContent = 'Copied!';
        copyBtn.classList.add('copied');
        setTimeout(() => {
          copyBtn.textContent = 'Copy';
          copyBtn.classList.remove('copied');
        }, 1500);
      });
    });
    header.appendChild(copyBtn);
  }

  section.appendChild(header);

  const content = document.createElement('div');
  content.className = `prompt-text${isEmpty ? ' empty' : ''}`;
  content.textContent = text;
  section.appendChild(content);

  promptsPanel.appendChild(section);
}

function updateSourceBadge(source) {
  // Remove existing badge if any
  const existingBadge = fileInfo.querySelector('.source-badge');
  if (existingBadge) {
    existingBadge.remove();
  }

  const badge = document.createElement('span');
  badge.className = `source-badge ${source}`;
  badge.textContent = source === 'comfyui' ? 'ComfyUI' : 'A1111';
  fileInfo.appendChild(badge);
}

function extractBalancedJson(str) {
  let braceCount = 0;
  let start = str.indexOf('{');

  if (start === -1) return null;

  for (let i = start; i < str.length; i++) {
    if (str[i] === '{') braceCount++;
    else if (str[i] === '}') braceCount--;

    if (braceCount === 0) {
      return str.substring(start, i + 1);
    }
  }

  return null;
}

function showError(message) {
  promptsPanel.innerHTML = '';
  addPromptSection('', 'Error', message, true);
  jsonContent.textContent = 'No workflow data';
  jsonContent.classList.add('empty');
  downloadBtn.disabled = true;
  copyJsonBtn.disabled = true;
  currentWorkflow = null;
}
