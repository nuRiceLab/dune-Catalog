import { useState, useEffect } from 'react';
import MonacoEditor from '@monaco-editor/react';

interface JsonEditorProps {
  value: Record<string, unknown> | string;
  onChange: (newContent: Record<string, unknown> | string) => void;
}

export default function JsonEditor({ value, onChange }: JsonEditorProps) {
  // If value is a string, use it directly; otherwise, stringify it
  const [editorContent, setEditorContent] = useState<string>(
    typeof value === 'string' ? value : JSON.stringify(value, null, 2)
  );
  const [isValid, setIsValid] = useState(true);

  // Update editor content when value prop changes
  useEffect(() => {
    if (typeof value === 'string') {
      // If it's already a string, try to parse it to validate and format
      try {
        const parsed = JSON.parse(value);
        setEditorContent(JSON.stringify(parsed, null, 2));
      } catch {
        // If it's not valid JSON, use it as is
        setEditorContent(value);
      }
    } else {
      // If it's an object, stringify it
      setEditorContent(JSON.stringify(value, null, 2));
    }
  }, [value]);

  const handleEditorChange = (value: string | undefined) => {
    if (!value) return;
    setEditorContent(value);
    
    // Store the content as a string, but don't validate on every keystroke
    onChange(value);
    
    // Optional: do a lightweight check for obvious syntax errors
    // This is less strict than full JSON.parse validation
    const hasUnbalancedBraces = (
      (value.match(/{/g) || []).length !== (value.match(/}/g) || []).length ||
      (value.match(/\[/g) || []).length !== (value.match(/\]/g) || []).length
    );
    
    setIsValid(!hasUnbalancedBraces);
  };

  return (
    <div className="flex flex-col space-y-2">
      <div className={`border rounded-md ${isValid ? 'border-border' : 'border-destructive'}`}>
        <MonacoEditor
          height="500px"
          language="json"
          theme="vs-dark"
          value={editorContent}
          onChange={handleEditorChange}
          options={{
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            folding: true,
            lineNumbers: 'on',
            wordWrap: 'on',
            formatOnPaste: true,
            formatOnType: true,
          }}
        />
      </div>
      {!isValid && (
        <div className="text-sm text-destructive">
          Possible JSON syntax error. Check for balanced braces and brackets.
        </div>
      )}
    </div>
  );
}
