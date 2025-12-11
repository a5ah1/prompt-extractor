# Prompt & Workflow Extractor

![Prompt & Workflow Extractor](ohgee.jpeg)

Extract prompts, workflows, and generation data from AI-generated images. Runs entirely in your browser - no uploads, no servers.

**[Try it live](https://a5ah1.github.io/prompt-extractor/)**

## Supported Sources

- **ComfyUI** - Extracts full workflow JSON and prompts from CLIPTextEncode and CLIPTextEncodeFlux nodes. Detects FaceDetailer prompts.
- **Automatic1111** - Extracts positive/negative prompts, ADetailer prompts, and generation parameters.

## Supported Formats

JPEG, PNG, and WEBP images with embedded metadata.

## Usage

1. Drop an image onto the page (or click to select)
2. View extracted prompts and parameters
3. Copy individual prompts or download the full workflow JSON (ComfyUI only)

## How It Works

AI image generators embed metadata in different locations depending on the tool and format:

### ComfyUI

ComfyUI stores the complete workflow JSON in the image's `ImageDescription` field, prefixed with `Workflow:`. The extractor:

- Parses the workflow JSON to find prompt nodes
- Extracts text from `CLIPTextEncode` and `CLIPTextEncodeFlux` nodes
- Traces the workflow graph to identify FaceDetailer prompts separately from main prompts
- Uses node types and graph connections (not user-editable titles) for reliable detection

### Automatic1111

A1111 stores generation data differently per format:

| Format | Location | Encoding |
|--------|----------|----------|
| PNG | `parameters` tEXt chunk | Plain UTF-8 |
| JPEG | EXIF `UserComment` | UTF-16 BE with `UNICODE` prefix |
| WEBP | EXIF `UserComment` in RIFF | Same as JPEG |

The extractor parses the A1111 text format to separate positive prompts, negative prompts, ADetailer prompts, and generation parameters.

**Note:** The exifr library doesn't support WEBP, so we include a manual RIFF/EXIF parser for that format.

## A Note

This is a casual personal project, provided as-is. It extracts from particular workflows and may not work for everyone. Feel free to fork or adapt it if useful.

## License

This project is released under the [WTFPL](http://www.wtfpl.net/).

The [exifr](https://github.com/MikeKovarik/exifr) library is used for EXIF parsing and is licensed under MIT (Copyright Mike Kovarik).
