import { Button } from "@/components/ui/button"
import { login, logout } from "@/lib/auth"
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
        setIsSubmitting(true);
        try {
            // Attempt login with provided credentials
            const response = await login(values)

            if (response.success) {
                setIsLoggedIn(true)
                setOpen(false)
                toast({
                    variant: "success",
                    title: "Login Successful",
                    description: "You have successfully logged in.",
                })
                // Reset form after successful login
                form.reset();
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
                title: "Login Failed",
                description: "An error occurred during login.",
            })
        } finally {
            setIsSubmitting(false);
        }
    }

    const handleLogout = () => {
        logout();
        setIsLoggedIn(false);
        toast({
            variant: "success",
            title: "Logged Out",
            description: "You have been logged out successfully.",
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
        </>
    )
}