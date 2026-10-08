"use client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import Link from "next/link";
import { Dispatch, SetStateAction } from "react";
import { keys } from "./types";
import { DataPolicyDialog } from "./data-policy-dialog";
import { FF_SCOUTER_URL } from "./data-policy";

const formSchema = z.object({
  ffScouterKey: z.string().min(16).max(16),
});

interface LoginFormProps extends React.ComponentProps<"div"> {
  setKeys: Dispatch<SetStateAction<keys | undefined>>;
}

export function LoginForm({ className, setKeys, ...props }: LoginFormProps) {
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      ffScouterKey: "",
    },
  });

  function onSubmit(values: z.infer<typeof formSchema>) {
    localStorage.setItem("keys", JSON.stringify(values));
    setKeys(values);
  }
  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader>
          <CardTitle>Enter your FF Scouter API key</CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
              <FormField
                control={form.control}
                name="ffScouterKey"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>FF Scouter API Key</FormLabel>
                    <FormControl>
                      <Input type="password" autoComplete="off" {...field} />
                    </FormControl>
                    <FormDescription>
                      Your Torn API key, registered with FF Scouter. This site
                      needs FF Scouter&apos;s battle stat estimates and
                      won&apos;t work without one.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit">Submit</Button>
            </form>
          </Form>
          {/* 

          left this here in case u want to style the form as before, im too lazy


          <form onSubmit={formSubmit}>
            <div className="flex flex-col gap-6">
              <div className="grid gap-3">
                <Label htmlFor="ffscouterKey">FF Scouter V3 API Key</Label>
                <Input
                  id="ffscouterKey"
                  type="password"
                  placeholder=""
                  required
                />
              </div>
              <div className="grid gap-3">
                <div className="flex items-center">
                  <Label htmlFor="publicKey">Public Torn API Key</Label>
                </div>
                <Input id="publicKey" type="password" required />
              </div>
              <div className="flex flex-col gap-3">
                <Button type="submit" className="w-full">
                  Login
                </Button>
              </div>
            </div> */}
          <div className="mt-4 text-center text-sm">
            <Link
              href={FF_SCOUTER_URL}
              className="underline underline-offset-4"
            >
              Create an FF Scouter key
            </Link>{" "}
            · <DataPolicyDialog />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
