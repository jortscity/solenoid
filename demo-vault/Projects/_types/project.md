---
kind: mdbase.type
name: project
match:
  path_glob: "*.md"
schema:
  value:
    type: object
    properties:
      status:
        type: string
        enum: [planning, active, blocked, done]
      priority:
        type: integer
        minimum: 1
        maximum: 5
      budget:
        type: number
      due:
        type: string
        format: date
      lead:
        type: string
      tags:
        type: array
        items:
          type: string
      milestones:
        type: array
        items:
          type: object
          properties:
            name:
              type: string
            due:
              type: string
              format: date
            done:
              type: boolean
    required: [status, priority]
---
# Project

The type for every note in the Projects collection. `status` is an enum, `priority`
an integer 1–5, `budget` a number, `due` a date, `tags` a list, and `milestones` a
small table (name, due, done) — the nested shapes a plain frame can't hold, which is
why a Vault Folder reads a folder as a **cube**.
