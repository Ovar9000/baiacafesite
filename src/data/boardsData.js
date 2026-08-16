export const boardsData = [
  {
    id: "board-skimboard",
    name: "BAIA Signature Shore Skimboard",
    type: "Skimboard",
    image: "./images/skimboard.jpg",
    length: "41\"",
    level: "All Levels / Shorebreak Gliding",
    isFree: true,
    priceDisplay: "FREE",
    priceSubtext: "Complimentary for Cafe Guests",
    status: "available",
    features: [
      "Custom BAIA electric-blue graphic",
      "High-traction deck grip pad",
      "Free to use for all BAIA cafe guests"
    ],
    tag: "✨ Free for Guests"
  },
  {
    id: "gear-sea-mask",
    name: "HD Tempered Glass Snorkeling Mask",
    type: "Snorkeling Gear",
    image: "./images/SeaMask.jpg",
    length: "Universal Fit",
    level: "All Swimmers / Reef Snorkeling",
    isFree: false,
    ratePrice: 50,
    priceDisplay: "₱50",
    priceSubtext: "/ day rental",
    status: "available",
    features: [
      "Tempered HD anti-fog crystal lens",
      "180° panoramic marine reef view",
      "Soft food-grade silicone leakproof seal"
    ],
    tag: "Reef Adventure"
  },
  {
    id: "board-surfboard-9",
    name: "Classic Shore Cruiser 9'0\"",
    type: "Surfboard",
    image: "./images/Baia%20skimboard%20and%20coffee.jpg",
    length: "9'0\"",
    level: "Beginner to Intermediate",
    isFree: false,
    status: "soon",
    priceDisplay: "Coming Soon",
    priceSubtext: "In shaping & production",
    features: [
      "Custom shaped high-buoyancy EPS foam",
      "Single fin + stabilizers with leash",
      "Designed for Laurente bay swells"
    ],
    tag: "✦ Coming Soon ✦"
  }
];

export const cottageData = {
  title: "Barangay Laurente Floating Cottage",
  subtitle: "Official Booking Partner: BAIA Café (@thebaiacafe)",
  hours: "7:00 AM – 6:00 PM",
  image: "./images/Cottage%20rental.jpg",
  cottagePhoto: "./images/Cottage.jpg",
  rates: [
    {
      group: "Small Group",
      capacity: "Up to 20 Guests",
      price: 2000,
      badge: "Popular for Families"
    },
    {
      group: "Large Group",
      capacity: "21+ Guests",
      price: 3000,
      badge: "Events & Barkada"
    }
  ],
  features: [
    "Floating cottage over clear shallow turquoise waters",
    "Direct reef adventure & snorkeling access",
    "Life jacket provided for every guest",
    "Certified lifeguard on duty for your safety",
    "No corkage fee — bring your own food & favorite BAIA drinks"
  ],
  rentals: [
    { item: "Snorkeling Goggles / Mask", price: 50 }
  ],
  guidelines: [
    "Meet-up & jump-off point is BAIA Café",
    "Please arrive 15 minutes before scheduled slot",
    "Trips subject to calm tide & weather conditions",
    "Bring your own trash bag & take all trash with you"
  ]
};
