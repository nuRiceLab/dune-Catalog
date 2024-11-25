import { Button } from "@/components/ui/button"
import { mockLogin } from "@/lib/auth"
import { useToast } from "@/hooks/use-toast"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogDescription,
    DialogTitle,
} from "@/components/ui/dialog"
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import * as z from "zod"
import { useState } from "react";

interface LoginModalProps {
    isLoggedIn: boolean;
    setIsLoggedIn: (value: boolean) => void;
}
const formSchema = z.object({
    username: z.string().min(0, {
        message: "Username cannot be empty.",
    }),
    password: z.string().min(0, {
        message: "Password cannot be empty.",
    }),
})


export function LoginModal({ isLoggedIn, setIsLoggedIn }: LoginModalProps) {
    const [open, setOpen] = useState(false)
    const { toast } = useToast()
    const [isSubmitting, setIsSubmitting] = useState(false)
    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            username: "",
            password: "",
        },
    })

    async function onSubmit(values: z.infer<typeof formSchema>) {
        if (isSubmitting) return; // Prevent multiple submissions
        console.log(values.username, values.password)
        setIsSubmitting(true);
        try {
            const response = await mockLogin(values)

            if (response.success) {
                setIsLoggedIn(true)
                setOpen(false)
                toast({
                    variant: "success",
                    title: "Login Successful",
                    description: "You have successfully logged in.",
                })
            } else {
                toast({
                    variant: "destructive",
                    title: "Login Failed",
                    description: response.message || "An error occurred during login.",
                })
            }
        } catch (error) {
            console.error("Login error:", error);
            toast({
                variant: "destructive",
                title: "Login Error",
                description: error instanceof Error ? error.message : "An unexpected error occurred. Please try again.",
            })
        } finally {
            setIsSubmitting(false)
        }
    }

    function handleLogout() {
        setIsLoggedIn(false)
        toast({
            variant: "success", // Use the success variant for logout as well
            title: "Logged Out",
            description: "You have successfully logged out.",
        })
    }

    const handleButtonClick = () => {
        if (isLoggedIn) {
            handleLogout();
        } else {
            setOpen(true);
        }
    };
    return (
        <>
            <Button variant="outline" onClick={handleButtonClick}>
                {isLoggedIn ? "Logout" : "Login"}
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>Login</DialogTitle>
                        <DialogDescription>
                            Please enter your username and password for your MetaCat Account.
                        </DialogDescription>
                    </DialogHeader>
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                            <FormField
                            control={form.control}
                            name="username"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Username</FormLabel>
                                    <FormControl>
                                        <Input placeholder="Enter your username" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="password"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Password</FormLabel>
                                    <FormControl>
                                        <Input type="password" placeholder="Enter your password" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                            <Button type="submit" disabled={isSubmitting}>
                                {isSubmitting ? "Logging in..." : "Login"}
                            </Button>
                        </form>
                </Form>
            </DialogContent>
        </Dialog>
            {/*<Toaster />*/}
        </>
    )
}