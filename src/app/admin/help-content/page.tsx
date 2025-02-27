'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentUser, isUserAdmin } from '@/lib/auth';
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { 
  Save,
  Loader2,
  Plus,
  Trash2,
  MoveUp,
  MoveDown,
  Edit
} from "lucide-react";
import dynamic from 'next/dynamic';
import AdminSidebar from '@/components/AdminSidebar';
import { getConfigData, saveConfigData, CONFIG_FILES } from '@/lib/adminConfigApi';

// Dynamically import the JSON editor to avoid SSR issues
const JsonEditor = dynamic(() => import('@/components/JsonEditor'), { ssr: false });

interface HelpSection {
  title: string;
  content: string;
}

interface HelpContent {
  title: string;
  sections: HelpSection[];
}

export default function HelpContentPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [helpContent, setHelpContent] = useState<HelpContent>({
    title: '',
    sections: []
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isJsonMode, setIsJsonMode] = useState(false);
  const [jsonContent, setJsonContent] = useState('');
  const [editingSection, setEditingSection] = useState<number | null>(null);
  const [currentSection, setCurrentSection] = useState<HelpSection>({ title: '', content: '' });
  const [showJsonEditor, setShowJsonEditor] = useState(false);

  // Redirect non-admin users
  if (typeof window !== 'undefined' && !isUserAdmin()) {
    router.push('/');
    return null;
  }

  useEffect(() => {
    // Fetch help content data
    getConfigData(CONFIG_FILES.HELP_CONTENT)
      .then(data => {
        if (data.title && data.sections) {
          setHelpContent(data);
          setJsonContent(JSON.stringify(data, null, 2));
        }
        setIsLoading(false);
      })
      .catch(error => {
        console.error('Error loading help content:', error);
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to load help content. Please try again."
        });
        setIsLoading(false);
      });
  }, [toast]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      let dataToSave;
      
      if (isJsonMode) {
        // Use the JSON content
        try {
          dataToSave = JSON.parse(jsonContent);
          if (!dataToSave.title || !dataToSave.sections || !Array.isArray(dataToSave.sections)) {
            throw new Error('Invalid help content format');
          }
        } catch (error) {
          toast({
            variant: "destructive",
            title: "Invalid JSON",
            description: "Please check your JSON format and try again."
          });
          setIsSaving(false);
          return;
        }
      } else {
        // Use the form data
        dataToSave = helpContent;
      }
      
      await saveConfigData(CONFIG_FILES.HELP_CONTENT, dataToSave);
      
      toast({
        title: "success",
        description: "Help content has been updated successfully."
      });
    } catch (error) {
      console.error('Error saving help content:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to save changes. Please try again."
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddSection = () => {
    setEditingSection(null);
    setCurrentSection({ title: '', content: '' });
  };

  const handleEditSection = (index: number) => {
    setEditingSection(index);
    setCurrentSection({ ...helpContent.sections[index] });
  };

  const handleDeleteSection = (index: number) => {
    const newSections = [...helpContent.sections];
    newSections.splice(index, 1);
    setHelpContent({ ...helpContent, sections: newSections });
  };

  const handleMoveSection = (index: number, direction: 'up' | 'down') => {
    if (
      (direction === 'up' && index === 0) || 
      (direction === 'down' && index === helpContent.sections.length - 1)
    ) {
      return;
    }

    const newSections = [...helpContent.sections];
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    
    [newSections[index], newSections[newIndex]] = [newSections[newIndex], newSections[index]];
    
    setHelpContent({ ...helpContent, sections: newSections });
  };

  const handleSaveSection = () => {
    if (!currentSection.title || !currentSection.content) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Section title and content are required."
      });
      return;
    }

    const newSections = [...helpContent.sections];
    
    if (editingSection !== null) {
      newSections[editingSection] = { ...currentSection };
    } else {
      newSections.push({ ...currentSection });
    }
    
    setHelpContent({ ...helpContent, sections: newSections });
    setCurrentSection({ title: '', content: '' });
    setEditingSection(null);
  };

  const handleCancelEdit = () => {
    setCurrentSection({ title: '', content: '' });
    setEditingSection(null);
  };

  const toggleJsonMode = () => {
    if (isJsonMode) {
      // Switching from JSON to form
      try {
        // The jsonContent might already be a string from the editor
        const parsedData = typeof jsonContent === 'string' 
          ? JSON.parse(jsonContent) 
          : jsonContent;
          
        if (parsedData.title && parsedData.sections && Array.isArray(parsedData.sections)) {
          setHelpContent(parsedData);
          setIsJsonMode(false);
        } else {
          toast({
            title: 'Invalid JSON',
            description: 'JSON must contain a "title" and a "sections" array',
            variant: 'destructive',
          });
        }
      } catch (error) {
        toast({
          title: 'Invalid JSON',
          description: 'Please correct the JSON format before switching to form mode.',
          variant: 'destructive',
        });
      }
    } else {
      // Switching from form to JSON
      setJsonContent(JSON.stringify(helpContent, null, 2));
      setIsJsonMode(true);
    }
  };

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <AdminSidebar activePage="help-content" />

      {/* Main Content */}
      <div className="flex-1 overflow-auto">
        <div className="p-8">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-2xl font-bold">Help Content</h1>
              <p className="text-muted-foreground">
                Manage help documentation for your application
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button 
                variant="outline"
                onClick={toggleJsonMode}
              >
                {isJsonMode ? 'Form View' : 'JSON View'}
              </Button>
              <Button 
                onClick={handleSave} 
                disabled={isSaving || isLoading}
              >
                {isSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Save Changes
                  </>
                )}
              </Button>
            </div>
          </div>
          {isLoading ? (
            <div className="flex justify-center items-center py-8">
              <Loader2 className="h-8 w-8 animate-spin mr-2" />
              <span>Loading help content...</span>
            </div>
          ) : isJsonMode ? (
            <Card>
              <CardContent className="pt-6">
                <JsonEditor
                  value={jsonContent}
                  onChange={(value) => {
                    setJsonContent(value);
                    try {
                      const parsed = JSON.parse(value);
                      if (parsed.title && parsed.sections && Array.isArray(parsed.sections)) {
                        setHelpContent(parsed);
                      }
                    } catch (error) {
                      // Invalid JSON, just update the jsonContent
                    }
                  }}
                />
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Help Content Management</CardTitle>
                  <CardDescription>
                    Edit the content displayed in the help section of your application
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="helpTitle">Help Title</Label>
                    <Input 
                      id="helpTitle"
                      value={helpContent.title}
                      onChange={(e) => setHelpContent({ ...helpContent, title: e.target.value })}
                      className="mt-1.5"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <Label>Help Sections</Label>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={handleAddSection}
                        disabled={editingSection !== null}
                      >
                        <Plus className="mr-1 h-3 w-3" />
                        Add Section
                      </Button>
                    </div>
                    
                    {helpContent.sections.length > 0 ? (
                      <div className="space-y-2">
                        {helpContent.sections.map((section, idx) => (
                          <div 
                            key={idx} 
                            className="p-3 border rounded-md bg-card"
                          >
                            <div className="flex items-center justify-between mb-1">
                              <h3 className="font-medium">{section.title}</h3>
                              <div className="flex items-center space-x-1">
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  onClick={() => handleMoveSection(idx, 'up')}
                                  disabled={idx === 0}
                                  className="h-8 w-8 p-0"
                                >
                                  <MoveUp className="h-4 w-4" />
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  onClick={() => handleMoveSection(idx, 'down')}
                                  disabled={idx === helpContent.sections.length - 1}
                                  className="h-8 w-8 p-0"
                                >
                                  <MoveDown className="h-4 w-4" />
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  onClick={() => handleEditSection(idx)}
                                  disabled={editingSection !== null}
                                  className="h-8 w-8 p-0"
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  onClick={() => handleDeleteSection(idx)}
                                  className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                            <p className="text-muted-foreground text-sm line-clamp-2">{section.content}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-4 border rounded-md text-muted-foreground">
                        No help sections. Click "Add Section" to create one.
                      </div>
                    )}
                  </div>

                  {(editingSection !== null || currentSection.title || currentSection.content) && (
                    <Card className="border-primary">
                      <CardHeader className="py-3">
                        <CardTitle className="text-base">
                          {editingSection !== null ? 'Edit Section' : 'New Section'}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4 py-2">
                        <div>
                          <Label htmlFor="sectionTitle">Section Title</Label>
                          <Input 
                            id="sectionTitle"
                            value={currentSection.title}
                            onChange={(e) => setCurrentSection({ ...currentSection, title: e.target.value })}
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <Label htmlFor="sectionContent">Section Content</Label>
                          <Textarea 
                            id="sectionContent"
                            value={currentSection.content}
                            onChange={(e) => setCurrentSection({ ...currentSection, content: e.target.value })}
                            className="mt-1 min-h-[100px]"
                          />
                        </div>
                      </CardContent>
                      <CardFooter className="flex justify-end space-x-2 py-3">
                        <Button 
                          variant="outline" 
                          onClick={handleCancelEdit}
                        >
                          Cancel
                        </Button>
                        <Button 
                          onClick={handleSaveSection}
                        >
                          {editingSection !== null ? 'Update Section' : 'Add Section'}
                        </Button>
                      </CardFooter>
                    </Card>
                  )}
                </CardContent>
                <CardFooter className="flex justify-between">
                </CardFooter>
              </Card>

              {showJsonEditor && (
                <Card>
                  <CardHeader>
                    <CardTitle>Raw JSON Editor</CardTitle>
                    <CardDescription>
                      Advanced: Edit the helpContent.json file directly
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[300px] border rounded-md">
                      <JsonEditor
                        value={helpContent}
                        onChange={(value) => {
                          if (value && typeof value === 'object' && 'title' in value && 'sections' in value) {
                            setHelpContent(value as HelpContent);
                          }
                        }}
                      />
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
