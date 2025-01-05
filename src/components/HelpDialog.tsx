import { HelpCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import helpContent from '@/config/helpContent.json'

export function HelpDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon">
          <HelpCircle className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{helpContent.title}</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-4 mt-2">
              {helpContent.sections.map((section, index) => (
                <div key={index} className="space-y-1.5">
                  <h4 className="font-semibold">{section.title}</h4>
                  <p className="text-sm text-muted-foreground">{section.content}</p>
                </div>
              ))}
            </div>
          </DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  )
}
