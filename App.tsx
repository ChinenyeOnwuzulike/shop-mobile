import { useEffect, useState } from "react";
import { Button, ScrollView, Text, TextInput, View } from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { supabase } from "./lib/supabase";

WebBrowser.maybeCompleteAuthSession();

const WEBSITE = "https://shop-app-yc3q.vercel.app";

const PRODUCTS = [
  { id: 1, name: "Classic T-Shirt", price: 8500, emoji: "👕" },
  { id: 2, name: "Sneakers", price: 25000, emoji: "👟" },
  { id: 3, name: "Backpack", price: 15000, emoji: "🎒" },
  { id: 4, name: "Wrist Watch", price: 32000, emoji: "⌚" },
  { id: 5, name: "Sunglasses", price: 9500, emoji: "🕶️" },
  { id: 6, name: "Cap", price: 4500, emoji: "🧢" },
];

type CartRow = {
  product_id: number;
  product_name: string;
  price: number;
  qty: number;
  emoji: string;
};

const inputStyle = {
  borderWidth: 1,
  borderColor: "#cccccc",
  borderRadius: 6,
  padding: 10,
  marginBottom: 10,
};

export default function App() {
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [cart, setCart] = useState<CartRow[]>([]);
  const [screen, setScreen] = useState<"shop" | "checkout" | "placed">("shop");
  const [form, setForm] = useState({ name: "", email: "", address: "" });
  const [placing, setPlacing] = useState(false);

  const total = cart.reduce((sum, c) => sum + c.price * c.qty, 0);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user.id ?? null);
      setEmail(data.session?.user.email ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user.id ?? null);
      setEmail(session?.user.email ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (userId) {
      loadCart();
    } else {
      setCart([]);
      setScreen("shop");
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const channel = supabase
      .channel("cart-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "cart_items" },
        () => {
          clearTimeout(timer);
          timer = setTimeout(loadCart, 400);
        }
      )
      .subscribe();
    return () => {
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [userId]);

  async function loadCart() {
    if (!userId) return;
    const { data } = await supabase
      .from("cart_items")
      .select("*")
      .eq("user_id", userId)
      .order("created_at");
    setCart((data ?? []) as CartRow[]);
  }

  async function addToCart(p: (typeof PRODUCTS)[number]) {
    if (!userId) return;
    const existing = cart.find((c) => c.product_name === p.name);
    const qty = existing ? existing.qty + 1 : 1;
    await supabase.from("cart_items").upsert(
      {
        user_id: userId,
        product_id: p.id,
        product_name: p.name,
        price: p.price,
        emoji: p.emoji,
        qty,
      },
      { onConflict: "user_id,product_name" }
    );
    await loadCart();
  }

  async function removeOne(item: CartRow) {
    if (!userId) return;
    if (item.qty > 1) {
      await supabase
        .from("cart_items")
        .update({ qty: item.qty - 1 })
        .eq("user_id", userId)
        .eq("product_name", item.product_name);
    } else {
      await supabase
        .from("cart_items")
        .delete()
        .eq("user_id", userId)
        .eq("product_name", item.product_name);
    }
    await loadCart();
  }

  function openCheckout() {
    setForm({ name: "", email: email ?? "", address: "" });
    setScreen("checkout");
  }

  async function placeOrder() {
    if (!userId) return;
    if (!form.name || !form.email || !form.address) {
      alert("Please fill in all the fields.");
      return;
    }
    setPlacing(true);
    const items = cart.map((c) => ({
      id: c.product_id,
      name: c.product_name,
      price: c.price,
      emoji: c.emoji,
      qty: c.qty,
    }));
    try {
      const res = await fetch(WEBSITE + "/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customer: form, items, total }),
      });
      if (!res.ok) {
        alert("Something went wrong. Please try again.");
      } else {
        await supabase.from("cart_items").delete().eq("user_id", userId);
        await loadCart();
        setScreen("placed");
      }
    } catch {
      alert("Network problem. Please try again.");
    }
    setPlacing(false);
  }

  async function signIn() {
    const appUrl = Linking.createURL("/");
    const redirectTo = WEBSITE + "/mobile-auth?to=" + encodeURIComponent(appUrl);

    const { data } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (!data?.url) return;

    const result = await WebBrowser.openAuthSessionAsync(data.url, appUrl);
    if (result.type !== "success") return;

    const code = new URL(result.url).searchParams.get("code");
    if (code) {
      await supabase.auth.exchangeCodeForSession(code);
    } else {
      const params = new URLSearchParams(result.url.split("#")[1]);
      const access_token = params.get("access_token");
      const refresh_token = params.get("refresh_token");
      if (access_token && refresh_token) {
        await supabase.auth.setSession({ access_token, refresh_token });
      }
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  if (!userId) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 24 }}>
        <Text style={{ fontSize: 28, fontWeight: "bold", marginBottom: 20 }}>My Shop</Text>
        <Button title="Sign in with Google" onPress={signIn} />
      </View>
    );
  }

  if (screen === "placed") {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 24 }}>
        <Text style={{ fontSize: 60 }}>✅</Text>
        <Text style={{ fontSize: 24, fontWeight: "bold", marginVertical: 12 }}>Order placed!</Text>
        <Text style={{ marginBottom: 20 }}>Thank you, {form.name}.</Text>
        <Button title="Back to shop" onPress={() => setScreen("shop")} />
      </View>
    );
  }

  if (screen === "checkout") {
    return (
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 60 }}>
        <Text style={{ fontSize: 28, fontWeight: "bold", marginBottom: 12 }}>Checkout</Text>

        <Text style={{ fontSize: 20, fontWeight: "bold", marginBottom: 8 }}>Order summary</Text>
        {cart.length === 0 && <Text>Your cart is empty.</Text>}
        {cart.map((c) => (
          <Text key={c.product_name} style={{ paddingVertical: 4 }}>
            {c.emoji} {c.product_name} x {c.qty} - ₦{(c.price * c.qty).toLocaleString()}
          </Text>
        ))}
        <Text style={{ fontWeight: "bold", marginVertical: 12 }}>
          Total: ₦{total.toLocaleString()}
        </Text>

        <Text style={{ fontSize: 20, fontWeight: "bold", marginBottom: 8 }}>Your details</Text>
        <TextInput
          style={inputStyle}
          placeholder="Full name"
          value={form.name}
          onChangeText={(t) => setForm({ ...form, name: t })}
        />
        <TextInput
          style={inputStyle}
          placeholder="Email"
          keyboardType="email-address"
          autoCapitalize="none"
          value={form.email}
          onChangeText={(t) => setForm({ ...form, email: t })}
        />
        <TextInput
          style={inputStyle}
          placeholder="Delivery address"
          value={form.address}
          onChangeText={(t) => setForm({ ...form, address: t })}
        />
        <Button
          title={placing ? "Placing order..." : "Place order"}
          color="#16a34a"
          disabled={placing || cart.length === 0}
          onPress={placeOrder}
        />
        <View style={{ height: 12 }} />
        <Button title="Back to shop" onPress={() => setScreen("shop")} />
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 60 }}>
      <Text style={{ fontSize: 28, fontWeight: "bold" }}>My Shop</Text>
      <Text style={{ marginVertical: 8 }}>Signed in as {email}</Text>
      <Button title="Sign out" onPress={signOut} />

      <Text style={{ fontSize: 20, fontWeight: "bold", marginTop: 24, marginBottom: 8 }}>
        Products
      </Text>
      {PRODUCTS.map((p) => (
        <View
          key={p.id}
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingVertical: 8,
          }}
        >
          <Text style={{ flex: 1 }}>
            {p.emoji} {p.name} - ₦{p.price.toLocaleString()}
          </Text>
          <Button title="Add" onPress={() => addToCart(p)} />
        </View>
      ))}

      <Text style={{ fontSize: 20, fontWeight: "bold", marginTop: 24, marginBottom: 8 }}>
        Cart ({cart.length})
      </Text>
      {cart.length === 0 && <Text>Your cart is empty.</Text>}
      {cart.map((c) => (
        <View
          key={c.product_name}
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingVertical: 6,
          }}
        >
          <Text style={{ flex: 1 }}>
            {c.emoji} {c.product_name} x {c.qty} - ₦{(c.price * c.qty).toLocaleString()}
          </Text>
          <Button title="Remove" color="#c0392b" onPress={() => removeOne(c)} />
        </View>
      ))}
      <Text style={{ fontWeight: "bold", marginVertical: 12 }}>
        Total: ₦{total.toLocaleString()}
      </Text>
      {cart.length > 0 && <Button title="Checkout" onPress={openCheckout} />}
    </ScrollView>
  );
}