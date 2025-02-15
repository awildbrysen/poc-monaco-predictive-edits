import React, { useEffect, useRef, useState } from 'react'
import * as monaco from 'monaco-editor'
import { pipe } from 'fp-ts/lib/function'
import * as A from 'fp-ts/Array'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { prompt } from './prompt'

const generativeAI = new GoogleGenerativeAI("<gemini-api-key-here>")
const model = generativeAI.getGenerativeModel({ model: 'gemini-2.0-flash' })

export const Editor = () => {
    const [editor, setEditor] = useState<monaco.editor.IStandaloneCodeEditor | null>(null)
    const monacoElement = useRef<HTMLDivElement | null>(null)
    const editorCreated = useRef(false)

    const userEdits = useRef<Array<monaco.editor.IModelContentChangedEvent>>([])
    const onChangeTimeout = useRef<number | null>(null)

    const [suggestedEdits, setSuggestedEdits] = useState<Array<{ line: number; text: string; }>>([]) 

    useEffect(() => {
        if (monacoElement.current && !editorCreated.current) {
            const newEditor = monaco.editor.create(monacoElement.current, {
                value: ['const a = ""', 'const empty = a === ""'].join('\n'),
                language: 'typescript'
            });
            newEditor.onDidChangeModelContent(e => {
                // TODO: How do we get the text before changes?
                // Do we just grab it on the first event and subtract the edit that was already made?

                if (onChangeTimeout.current) clearTimeout(onChangeTimeout.current);
                userEdits.current.push(e);
                onChangeTimeout.current = setTimeout(() => {
                    const changes = pipe(
                        userEdits.current,
                        A.map(e => e.changes),
                        A.flatten,
                        A.map(c => ({
                            startLineNumber: c.range.startLineNumber,
                            startColumn: c.range.startColumn,
                            endLineNumber: c.range.endLineNumber,
                            endColumn: c.range.endColumn,
                            text: c.text,
                        })),
                        A.map(c => "User edit: " + c.text + " at line " + c.startLineNumber + " column " + c.startColumn + " to line " + c.endLineNumber + " column " + c.endColumn),
                    )

                    prompt.replace('<events>', changes.join('\n'))
                    const promptWithCode = prompt + `\n\n${newEditor.getValue()}`
                
                    model.generateContent(promptWithCode)
                        .then(r => {
                            const text = r.response.text()
                            const cleaned = text.replaceAll('```json', "").replaceAll('```', '')
                            console.log('Trying to parse cleaned up code', cleaned)
                            const parsed = JSON.parse(cleaned)
                            if (Array.isArray(parsed) && parsed.length !== 0) {
                                if ('line' in parsed[0] && 'text' in parsed[0]) {
                                    setSuggestedEdits(parsed)
                                }
                            }
                            console.log('Model response', r.response.text())
                        })
                        .catch(e => console.error('Something went wrong while request generation from model', e))
                    userEdits.current = [];
                }, 700);
            })
            setEditor(newEditor);
            editorCreated.current = true;
        }

        return () => editor?.dispose()

    }, [])

    const applySuggestedEdit = (se: { line: number; text: string; }) => {
        setSuggestedEdits(ses => ses.filter(s => s.line !== se.line));
        editor?.getModel()?.pushEditOperations([], [
            { range: new monaco.Range(se.line, 0, se.line, 10000), text: se.text }
        ], () => null)
    }

    return <div style={{ display: 'flex', flexDirection: 'row' }}>
        <div style={{ width: '80vw', height: '80vh' }} ref={monacoElement}></div>
        <div style={{ margin: '5px' }}>
            <p>Suggested edits:</p>
            {suggestedEdits.map(se => <div><p>Line {se.line}: {se.text}</p><button onClick={() => applySuggestedEdit(se)}>apply</button></div>)}
        </div>
    </div>
}