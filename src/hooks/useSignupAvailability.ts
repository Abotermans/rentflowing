import { useEffect, useState } from "react";
import { readSignupAvailability, type SignupAvailability } from "@/lib/signupAvailability";

export function useSignupAvailability(): SignupAvailability | "checking" {
  const [availability, setAvailability] = useState<SignupAvailability | "checking">("checking");
  useEffect(() => {
    let active = true;
    void readSignupAvailability(
      import.meta.env.VITE_SUPABASE_URL,
      import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    ).then(result => {
      if (active) setAvailability(result);
    });
    return () => { active = false; };
  }, []);
  return availability;
}
