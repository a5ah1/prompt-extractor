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

## A Note

This is a casual personal project, provided as-is. It extracts from particular workflows and may not work for everyone. Feel free to fork or adapt it if useful.

## License

This project is released under the [WTFPL](http://www.wtfpl.net/).

The [exifr](https://github.com/MikeKovarik/exifr) library is used for EXIF parsing and is licensed under MIT (Copyright Mike Kovarik).
