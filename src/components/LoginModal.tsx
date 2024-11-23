import { Button } from "@/components/ui/button"
import { mockLogin } from "@/lib/auth"
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
import {useEffect, useState} from "react";
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
    const [open, setOpen] = useState(false);
    const [isVisible, setIsVisible] = useState(true);
    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            username: "",
            password: "",
        },
    });
    useEffect(() => {
        if (open) {
            setIsVisible(true);
        }
    }, [open]);
    const handleLogin = async (username: string, password: string) => {
        // fix "enter spamming" i.e. clicking enter/submit multiple times, and it logs in multiple times
        try {
            const response = await mockLogin({ username, password });
            if (response.success) {
                console.log(response.message);
                console.log(username, password);
                localStorage.setItem('token', response.token!);
                setIsVisible(false); // Start fade-out
                setTimeout(() => {
                    setIsLoggedIn(true);
                    setOpen(false); // Close dialog after fade-out
                }, 200);
            } else {
                console.error(response.message);
            }
        } catch (error) {
            console.error('Login error:', error);
        }
    };

    const handleLogout = () => {
        localStorage.removeItem('token');
        setIsLoggedIn(false);
    };

    function onSubmit(values: z.infer<typeof formSchema>) {
        handleLogin(values.username, values.password);
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
                <DialogContent className={`sm:max-w-[425px] transition-opacity duration-200 ${isVisible ? 'opacity-100' : 'opacity-0'}`}>
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
                        <Button type="submit">Submit</Button>
                    </form>
                </Form>
            </DialogContent>

        </Dialog>
        </>
    )
}