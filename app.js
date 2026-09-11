import React, { useEffect } from "react";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { ThemeProvider } from "./contexts/ThemeContext";
import { ToastContainer } from "react-toastify";

// Layout Components
import Navbar from "./components/Layout/Navbar";
import Sidebar from "./components/Layout/Sidebar";
import SearchOverlay from "./components/Layout/SearchOverlay";
import CartSidebar from "./components/Layout/CartSidebar";
import ProfilePanel from "./components/Layout/ProfilePanel";
import LoginModal from "./components/Layout/LoginModal";
import Footer from "./components/Layout/Footer";

// Pages
import Index from "./pages/Home";
import Products from "./pages/Products";
import ProductDetail from "./pages/ProductDetail";
import Cart from "./pages/Cart";
import Orders from "./pages/Orders";
import Payment from "./pages/Payment";
import About from "./pages/About";
import FAQ from "./pages/FAQ";
import Contact from "./pages/Contact";
import PayForMe from "./pages/PayForMe";
import NotFound from "./pages/NotFound";

// Redux Actions
import { getuser } from "./store/slices/authSlice";
import { fetchAllProducts } from "./store/slices/productSlice";

// Main App Layout Component to use useLocation hook safely inside BrowserRouter
const MainLayout = () => {
  const dispatch = useDispatch();
  const location = useLocation();
  const { authUser, isCheckingAuth } = useSelector((state) => state.auth);

  useEffect(() => {
    dispatch(getuser());
    dispatch(fetchAllProducts());
  }, [dispatch]);

  // Check if current route is a Pay-For-Me page
  const isPayForMeRoute = location.pathname.startsWith("/pay-for-me");

  if (isCheckingAuth && !authUser && !isPayForMeRoute) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#120b0e]">
        <div className="w-10 h-10 border-4 border-[#9c5b6f]/30 border-t-[#9c5b6f] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-[#120b0e] text-[#2b141d] dark:text-[#f7eef1] transition-colors duration-300 flex flex-col justify-between">
      <div>
        {/* Hide global navigation and panels if it's the secure Pay-For-Me route */}
        {!isPayForMeRoute && (
          <>
            <Navbar />
            <Sidebar />
            <SearchOverlay />
            <CartSidebar />
            <ProfilePanel />
            <LoginModal />
          </>
        )}

        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/password/reset/:token" element={<Index />} />
          <Route path="/products" element={<Products />} />
          <Route path="/product/:id" element={<ProductDetail />} />
          <Route path="/cart" element={<Cart />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/payment" element={<Payment />} />
          <Route path="/pay-for-me/:token" element={<PayForMe />} />
          <Route path="/about" element={<About />} />
          <Route path="/faq" element={<FAQ />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </div>

      {!isPayForMeRoute && <Footer />}
    </div>
  );
};

const App = () => {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <MainLayout />
        <ToastContainer position="bottom-right" theme="colored" autoClose={3000} />
      </BrowserRouter>
    </ThemeProvider>
  );
};

export default App;