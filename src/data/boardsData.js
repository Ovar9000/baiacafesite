export const boardsData = [
  {
    id: "board-skimboard",
    name: "BAIA Shore Skimboard",
    type: "Recreational Gear",
    image: "./images/skimboard.webp",
    length: "41\"",
    level: "All Levels / Shorebreak Gliding",
    isFree: true,
    priceDisplay: "FREE",
    priceSubtext: "Complimentary for Cafe Guests",
    status: "available",
    features: [
      "Custom BAIA electric-blue graphic",
      "High-traction deck grip pad",
      "Complimentary for all cafe guests to enjoy on the shore"
    ],
    tag: "✨ Free for Guests"
  },
  {
    id: "gear-sea-mask",
    name: "HD Tempered Glass Snorkeling Mask",
    type: "Recreational Gear",
    image: "./images/SeaMask.webp",
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
    id: "gear-beach-lounge",
    name: "Shorefront Lounge Chair & Parasol Set",
    type: "Beach Leisure",
    image: "./images/beachandchill.webp",
    length: "Full Set (Chair + Umbrella)",
    level: "All Cafe Guests / Sunset Relaxation",
    isFree: true,
    priceDisplay: "FREE",
    priceSubtext: "Complimentary for Dine-in Guests",
    status: "available",
    features: [
      "Comfortable reclining beachside lounge chairs",
      "Wide UV-protective tropical parasol shade",
      "Reserved waterfront spots right on the sand"
    ],
    tag: "🏖️ Free for Guests"
  },
  {
    id: "board-surfboard-9",
    name: "Classic Shore Cruiser 9'0\"",
    type: "Surfboard",
    image: "./images/surfboard-blueprint.svg",
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
  hours: "11:00 AM – 6:00 PM (Cafe open until 10:00 PM)",
  image: "./images/Cottage%20rental.webp",
  cottagePhoto: "./images/Cottage.webp",
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
    "Direct reef exploration & snorkeling access",
    "Life jackets provided for every guest",
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
