# Open Curriculum Viewer

A lightweight Next.js viewer for open-curriculum lesson files. Renders a two-pane layout -- learner view and instructor view -- with built-in text-to-speech, quiz answer reveal, and video support.

## Quick start

**The easiest way** is to clone the parent curriculum repository (which includes this viewer as a submodule):

```bash
git clone --recurse-submodules https://github.com/serendipityconnection/open-curriculum
cd open-curriculum
./start.sh          # Mac / Linux
start.bat           # Windows
```

Then open [http://localhost:3000](http://localhost:3000).

---

## Standalone setup

If you are working on the viewer itself:

```bash
# 1. Clone this repo
git clone https://github.com/serendipityconnection/open-curriculum-viewer
cd open-curriculum-viewer

# 2. Install dependencies
npm install

# 3. Point the viewer at your content
#    By default it looks for ../programs/ relative to this folder.
#    Clone or symlink open-curriculum so that ../programs/ exists, or set CONTENT_BASE_PATH in .env

# 4. Start the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Content structure

The viewer expects curriculum content in the following layout:

```
programs/
  <program-folder>/
    manifest.yml          <- required: program metadata and module list
    curriculum/
      <module-folder>/
        lesson-<id>-<slug>.md
        ...
    delivery-config.yml   <- optional: instructor variable substitution
```

### manifest.yml

Minimal example:

```yaml
program_id: my-program
display_name: "My Program"
schema_version: 1
content_version: "1.0"
publisher: "Your Organization"
description: "A short description."
program_type: "course"
curriculum_root: curriculum/
config_root: config/
reference_root: resources/
total_hours: 40
tags: []
avatars: []

modules:
  - id: A
    folder: module-a-introduction
    title: "Introduction"
    hours: 10
    milestone: 1
```

See `delivery-config.example.yml` for all supported variable substitutions.

---

## Environment variables

Copy `.env.example` to `.env` and adjust as needed. All variables are optional.

| Variable | Default | Description |
|---|---|---|
| `CONTENT_BASE_PATH` | `../programs` | Path to the programs directory |
| `PROGRAM_FOLDER` | auto-detected | Folder name of the program to display |

---

## Lesson markup

Lessons are standard Markdown with a YAML frontmatter block and a set of optional directives. Full authoring standards are in `CONTENT_AUTHORING_STANDARDS.md` in the curriculum repository.

**Directives:**

| Syntax | Learner view | Instructor view |
|---|---|---|
| `{pause}` | hidden | pause marker between TTS segments |
| `{ask yourself: question text}` | amber reflection box | "Pose to learner" callout |
| `{may change: note}` | warning chip | full flag with detail |
| `{instructor: cue text}` | hidden | gray instruction box |

**Variables:** `{{instructor_name}}`, `{{modules_covered}}` -- replaced from `delivery-config.yml` at render time.

---

## Text-to-speech

Uses the browser's built-in Web Speech API -- no API key, no external service, works offline. The TTS reads the instructor script (the teaching content) in the Learner view as a substitute for a live instructor. Speed is adjustable (0.75x -- 1.5x). When a video file is present for a section, video takes priority and TTS becomes available via "Show lesson content."

**Browser recommendation:** Use **Chrome** or **Edge** for the best voice quality. Both include high-quality neural/online voices (Google US English, Microsoft voices) that sound natural. Firefox on Linux uses the system speech synthesizer (espeak by default), which sounds robotic.

---

## Video support

Place `.mp4` files alongside lesson content:

```
<module-folder>/
  lesson-a1-intro.mp4       # avatar / overview video
  lesson-a1-overview.mp4
```

The viewer serves them via `/api/media/` with byte-range support for seeking.

---

## License

This viewer is released under the MIT License. Curriculum content in the `programs/` directory is licensed separately under CC BY-SA 4.0.
