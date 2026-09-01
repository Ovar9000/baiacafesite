export const menuData = {
  drinks: [
    {
      category: "Classic",
      id: "classic",
      hasHotCold: true,
      items: [
        { id: "classic-longblack", name: "Long Black", price: 105, description: "Double shot espresso over hot water or iced" },
        { id: "classic-flatwhite", name: "Flat White", price: 125, description: "Velvety microfoam over rich espresso" },
        { id: "classic-cappuccino", name: "Cappuccino", price: 125, description: "Equal parts espresso, steamed milk, and silky foam" },
        { id: "classic-cafelatte", name: "Cafe Latte", price: 125, image: "./images/classiccafe.webp", description: "Smooth espresso with creamy steamed milk" },
        { id: "classic-butterscotch", name: "Butterscotch Reserve", price: 145, isSpecialty: true, description: "Espresso with rich buttery caramel butterscotch notes" }
      ]
    },
    {
      category: "House Special",
      id: "house-special",
      items: [
        { id: "special-einspanner", name: "Einspanner Latte", price: 190, isSpecialty: true, description: "Rich espresso topped with thick, velvety whipped sweet cream" },
        { id: "special-seasalt", name: "Sea Salt Latte", price: 180, isPopular: true, image: "./images/Baia skimboard and coffee.webp", description: "Smooth iced latte crowned with savory sea salt foam" },
        { id: "special-asintibuok", name: "Asin Tibuok Latte", price: 180, isSpecialty: true, description: "Artisanal Bohol sea salt, caramel notes, creamy espresso" },
        { id: "special-vanillasweetcream", name: "Vanilla Sweet Cream", price: 180, description: "Cold brew style latte with vanilla infused cream" },
        { id: "special-whitemochahazelnut", name: "White Mocha Hazelnut", price: 195, description: "Velvety white chocolate mocha and roasted hazelnut" },
        { id: "special-icedshaken", name: "Iced Shaken Espresso", price: 180, isPopular: true, description: "Espresso vigorously shaken with brown sugar, cinnamon, and ice" }
      ]
    },
    {
      category: "Signature Coffee",
      id: "signature-coffee",
      hasHotCold: true,
      items: [
        { id: "sig-vanilla", name: "Vanilla Latte", price: 150, description: "Madagascar vanilla infused cafe latte" },
        { id: "sig-spanish", name: "Spanish Latte", price: 150, isPopular: true, description: "Sweetened condensed milk balanced with bold espresso" },
        { id: "sig-saltedcaramel", name: "Salted Caramel", price: 150, description: "Buttery salted caramel sauce with espresso" },
        { id: "sig-mocha", name: "Mocha Latte", price: 175, description: "Rich Dutch dark cocoa and espresso" },
        { id: "sig-whitemocha", name: "White Mocha", price: 175, description: "Sweet white chocolate and espresso blend" },
        { id: "sig-caramelmacchiato", name: "Caramel Macchiato", price: 175, description: "Vanilla steamed milk marked with espresso & caramel drizzle" }
      ]
    },
    {
      category: "Blended",
      id: "blended",
      hasSizes: true,
      items: [
        { id: "blend-mocha", name: "Mocha Frapuccino", priceM: 180, priceL: 195, image: "./images/frappe.webp", description: "Ice-blended dark mocha topped with whipped cream" },
        { id: "blend-whitemocha", name: "White Mocha Frapuccino", priceM: 180, priceL: 195, description: "Creamy white chocolate blended frappe" },
        { id: "blend-caramel", name: "Caramel Frapuccino", priceM: 180, priceL: 195, isPopular: true, description: "Caramel blended frappe with buttery drizzle" },
        { id: "blend-biscoff", name: "Biscoff Frapuccino", priceM: 180, priceL: 195, isSpecialty: true, description: "Speculoos cookie butter ice-blended delight" },
        { id: "blend-javachip", name: "Java Chip Frapuccino", priceM: 180, priceL: 195, description: "Mocha frappe with crunchy chocolate chips" },
        { id: "blend-butterfinger", name: "Butterfinger Frapuccino", priceM: 195, priceL: 215, description: "Peanut buttery crisp candy ice blend" },
        { id: "blend-strawmilkshake", name: "Strawberry Milkshake", priceM: 180, priceL: 195, description: "Rich strawberry puree blended with fresh milk & ice cream" },
        { id: "blend-blueberrymilkshake", name: "Blueberry Milkshake", priceM: 180, priceL: 180, description: "Smooth blueberry ice-blended milkshake" },
        { id: "blend-cookiescream", name: "Cookies and Cream", priceM: 155, priceL: 170, description: "Crushed Oreos blended into vanilla cream" },
        { id: "blend-straworeo", name: "Strawberry Oreo Overload", priceM: 190, priceL: 205, isSpecialty: true, description: "Real strawberry puree & crunchy Oreo chunks" },
        { id: "blend-oreomint", name: "Oreo Mint Milk Shake", priceM: 175, priceL: 195, description: "Refreshing mint syrup and Oreo cookie blend" },
        { id: "blend-chocostraw", name: "Choco Strawberry", priceM: 175, priceL: 195, description: "Dark chocolate and strawberry blend" },
        { id: "blend-hazelnutnutella", name: "Hazelnut Nutella", priceM: 190, priceL: 215, isSpecialty: true, description: "Rich Nutella cocoa blend with roasted hazelnut" }
      ]
    },
    {
      category: "Noncoffee",
      id: "non-coffee",
      items: [
        { id: "non-cacao", name: "Cacao Calm", price: 135, hasHotCold: true, description: "Pure artisanal tablea cacao with warm milk" },
        { id: "non-matcha", name: "Matcha Latte", price: 205, hasHotCold: true, isPopular: true, description: "Uji Japanese ceremonial green tea latte" },
        { id: "non-hojicha", name: "Hojicha Latte", price: 190, hasHotCold: true, description: "Roasted Japanese green tea with nutty, toasty notes" },
        { id: "non-chocostraw", name: "Choco Strawberry", price: 175, description: "Layered iced dark chocolate and strawberry milk" },
        { id: "non-strawlatte", name: "Strawberry Latte", price: 145, description: "Fresh strawberry compote layered with whole milk" },
        { id: "non-strawmatcha", name: "Strawberry Matcha", price: 245, isSpecialty: true, description: "Vibrant three-tier drink: strawberry puree, milk, and matcha" }
      ]
    },
    {
      category: "Fruit Soda",
      id: "fruit-soda",
      items: [
        { id: "soda-sunset", name: "Sunset Fizz (Peach)", price: 135, isPopular: true, image: "./images/refresher.webp", description: "Sparkling peach soda with sunset ombre hue" },
        { id: "soda-crimson", name: "Crimson Pop (Strawberry)", price: 145, image: "./images/Baia refreshers.webp", description: "Fizzy strawberry soda with popping bubbles" },
        { id: "soda-razzle", name: "Razzle Pop (Raspberry)", price: 135, description: "Tart and sweet raspberry sparkling refresher" },
        { id: "soda-orchard", name: "Orchard Fizz (Red Apple)", price: 135, description: "Crisp red apple sparkling cooler" },
        { id: "soda-island", name: "Island Fizz (Pink Guava Strawberry)", price: 135, isSpecialty: true, image: "./images/Hibiscus berry refresher.webp", description: "Tropical pink guava and strawberry spritz" },
        { id: "soda-midnight", name: "Midnight Bubbles (Blueberry)", price: 135, isPopular: true, image: "./images/Tripleorder.webp", description: "Electric blue and deep blueberry sparkling soda" },
        { id: "soda-pinksky", name: "Pink Sky", price: 160, description: "Sparkling sunset pink refresher with citrus splash" },
        { id: "soda-pinkparadise", name: "Pink Paradise", price: 160, isSpecialty: true, description: "Tropical guava and berry paradise spritz" }
      ]
    },
    {
      category: "Iced Tea",
      id: "iced-tea",
      items: [
        { id: "tea-raspberry", name: "Iced Shaken Raspberry", price: 135, description: "Brewed black tea shaken with raspberry syrup" },
        { id: "tea-strawberry", name: "Iced Shaken Strawberry", price: 145, description: "Refreshing shaken tea with strawberry essence" },
        { id: "tea-peach", name: "Iced Shaken Peach", price: 135, description: "Southern style iced peach tea" },
        { id: "tea-sunkissed", name: "Sunkissed Earl", price: 135, description: "Bergamot Earl Grey tea shaken with citrus notes" },
        { id: "tea-goldenhour", name: "Golden Hour Tea", price: 170, isSpecialty: true, description: "Peach, Hibiscus Tea, Jasmine Tea, and Lemonade" }
      ]
    },
    {
      category: "Engkanto Craft Beer",
      id: "craft-beer",
      items: [
        { id: "beer-engkanto", name: "Engkanto Craft Beer", price: 0, description: "Please ask our cashier for today's available craft beer selection." }
      ]
    }
  ],
  food: [
    {
      category: "Mirindal",
      id: "mirindal",
      items: [
        { id: "waffle-nutella", name: "Nutella Waffle", subcategory: "Waffle", price: 120, description: "Fresh golden Belgian waffle with rich Nutella spread" },
        { id: "waffle-pbj", name: "Peanut Butter Jelly Waffle", subcategory: "Waffle", price: 140, description: "Classic peanut butter & berry jelly drizzle" },
        { id: "waffle-biscoff", name: "Biscoff Waffle", subcategory: "Waffle", price: 140, isPopular: true, image: "./images/biscoff.webp", description: "Lotus Biscoff spread, crushed speculoos crumbs" },
        { id: "fries-cheese", name: "Cheese Fries", subcategory: "Fries", price: 155, description: "Crispy skin-on fries tossed in savory cheese seasoning" },
        { id: "fries-sourcream", name: "Sour Cream Fries", subcategory: "Fries", price: 155, description: "Zesty sour cream & chive seasoning" },
        { id: "fries-sourcheese", name: "Sour Cheese Fries", subcategory: "Fries", price: 155, description: "Tangy sour cream and cheddar fusion" },
        { id: "fries-bbq", name: "BBQ Fries", subcategory: "Fries", price: 155, description: "Smoky barbecue seasoning" },
        { id: "fries-chilibbq", name: "Chili BBQ Fries", subcategory: "Fries", price: 155, isPopular: true, description: "Spicy kick BBQ seasoned fries" },
        { id: "nuggets-hashbrown", name: "Nuggets and Hashbrown", subcategory: "Mirindal", price: 295, description: "Crispy chicken nuggets paired with golden hashbrowns" }
      ]
    },
    {
      category: "Burgers",
      id: "burgers",
      items: [
        { id: "burger-cheese", name: "Cheese Burger", price: 180, description: "Juicy beef patty, melted cheddar, house sauce" },
        { id: "burger-sriracha", name: "Sriracha Cheese Burger", price: 190, description: "Spicy sriracha mayo, cheddar, grilled patty" },
        { id: "burger-triple", name: "Triple Cheese Burger", price: 200, description: "Triple layered melted cheese on premium beef" },
        { id: "burger-smash", name: "BAIA Smash Burger", price: 230, isPopular: true, image: "./images/smashburger.webp", description: "Signature crispy-edge double smash patty, secret BAIA sauce, pickles and seasoned fries" },
        { id: "burger-chicken", name: "Chicken Burger", price: 230, description: "Crispy seasoned fried chicken fillet, fresh lettuce" },
        { id: "burger-baconjalapeno", name: "BAIA Bacon Jalapeño Burger", price: 320, isSpecialty: true, image: "./images/Baia burger referesher combo.webp", description: "Smoked bacon, pickled jalapeño slices, house molten cheese, served with fries" },
        { id: "burger-longganisa", name: "Longganisa Breakfast Burger", price: 290, isSpecialty: true, description: "Beef patty, homemade longganisa patty, Holy Smoke Sauce, and sunny side up egg" }
      ]
    },
    {
      category: "Bread & Sandwich",
      id: "bread-sandwich",
      items: [
        { id: "bread-grilledcheese", name: "Grilled Cheese", price: 130, description: "Melted cheese blend on toasted buttered sourdough" },
        { id: "bread-grilledpbj", name: "Grilled Peanut Butter & Jelly", price: 130, description: "Warm toasted PB&J sandwich" },
        { id: "bread-baconegg", name: "Bacon Egg Cheese Sandwich", price: 200, isPopular: true, description: "Sandwich with sunny-side-up egg, bacon, and cheese" },
        { id: "bread-caesarwrap", name: "Caesar Chicken Wrap", price: 220, description: "Tender chicken, bacon, egg, crisp lettuce, and Caesar dressing wrapped in a soft tortilla" },
        { id: "bread-garlicparmwrap", name: "Garlic Parmesan Chicken Wrap", price: 240, isSpecialty: true, description: "Crispy garlic parmesan chicken wrapped in a warm soft tortilla" },
        { id: "bread-hampanini", name: "Ham & Cheese Panini", price: 200, description: "Grilled toasted sandwich with ham and melted cheese" },
        { id: "bread-chickenpesto", name: "Chicken Pesto Panini", price: 230, image: "./images/chickensandwich.webp", description: "Grilled chicken, pesto, and melted cheese pressed in toasted bread" }
      ]
    },
    {
      category: "Pub",
      id: "pub",
      items: [
        { id: "pub-chickentenders", name: "Chicken Tenders", price: 215, description: "Chicken tenders with dipping sauce" },
        { id: "pub-calamari", name: "Calamari", price: 250, description: "Golden crispy calamari rings (Good for 2-3 pax)" },
        { id: "pub-overload-buffalo", name: "Overload Fries — Hot Buffalo", price: 280, isPopular: true, description: "Loaded fries topped with tangy hot buffalo glaze" },
        { id: "pub-overload-concarne", name: "Overload Fries — Cheesy Con Carne", price: 300, isSpecialty: true, description: "Loaded fries with spiced beef con carne and molten cheese" }
      ]
    },
    {
      category: "Rice Meals",
      id: "rice-meals",
      items: [
        { id: "rice-baconegg", name: "Bacon Egg (Bacsilog)", price: 190, isPopular: true, description: "Crispy bacon, sunny egg, garlic rice" },
        { id: "rice-porkchop", name: "Vietnamese Porkchop (Large)", price: 245, description: "Marinated lemongrass pork chop with spiced dip & rice" },
        { id: "rice-bangbang", name: "Bang Bang Chicken Skewers", price: 210, isPopular: true, image: "./images/bacolodchicken.webp", description: "Grilled skewers with sweet & spicy creamy bang bang sauce" },
        { id: "rice-periperi", name: "Peri Peri Chicken", price: 240, description: "Flame-grilled peri-peri spiced chicken quarter" },
        { id: "rice-liempo", name: "BBQ Liempo", price: 270, isSpecialty: true, description: "Tender grilled marinated pork belly with signature glaze" },
        { id: "rice-inasal", name: "Bacolod Inasal", price: 240, isPopular: true, description: "Authentic grilled chicken inasal marinated in calamansi, lemongrass & annatto" },
        { id: "rice-beefpepper", name: "Beef Pepper Rice", price: 325, description: "Sizzling beef slices with cracked black pepper and corn" },
        { id: "rice-padkrapao", name: "Pad Kra Pao with Egg", price: 190, description: "Thai holy basil minced meat with fried egg" },
        { id: "rice-beeftapa", name: "Beef Tapa", price: 245, description: "Cured tender beef tapa with garlic rice & egg" },
        { id: "rice-cajunchicken", name: "Cajun Fried Chicken", price: 225, description: "Southern spiced crispy chicken fillet" },
        { id: "rice-cornedbeef", name: "Corned Beef", price: 215, description: "Sauteed premium chunky corned beef with onions" },
        { id: "rice-bulaklak", name: "Chicharon Bulaklak with Egg", price: 190, isPopular: true, description: "Crispy deep-fried chicharon bulaklak with sunny-side-up egg and spiced vinegar" },
        { id: "rice-wings", name: "Chicken Wings (3 Pieces)", price: 230, description: "Choice of flavor: Soy Honey Garlic, Lemon Pepper, Creamy Buffalo, or Yangnyeom" },
        { id: "rice-curry", name: "Chicken Omelette Curry", price: 320, isSpecialty: true, description: "Fluffy Japanese-style egg omelette over rice smothered in aromatic curry" },
        { id: "rice-nachotenders", name: "Nacho-Crusted Tenders", price: 250, isPopular: true, description: "Crispy nacho-crusted chicken tenders with white garlic cajun dipping sauce" }
      ]
    },
    {
      category: "Pasta",
      id: "pasta",
      items: [
        { id: "pasta-truffle", name: "Truffle Rigatoni", price: 295, isPopular: true, image: "./images/Pasta.webp", description: "Rigatoni pasta with shiitake and beech mushrooms, lightly coated in truffle oil and finished with Parmigiano Reggiano" },
        { id: "pasta-puttanesca", name: "Olive Puttanesca with Chicken Fajita", price: 245, description: "Olive puttanesca tossed in a bold tomato sauce with olives and capers, served with tender chicken fajita strips" },
        { id: "pasta-aglioeolio", name: "Aglio e Olio", price: 190, description: "Pasta tossed with garlic, olive oil, and herbs for a simple flavorful classic" },
        { id: "pasta-sundriedschnitzel", name: "Creamy Sundried Tomato Pasta w/ Schnitzel", price: 255, description: "Creamy sundried tomato pasta served with crispy chicken schnitzel" },
        { id: "pasta-carbonara", name: "Carbonara Pasta", price: 275, description: "A Filipino white pasta version with bacon and sausage" },
        { id: "pasta-signature", name: "BAIA Signature Rigatoni Pasta", price: 280, isSpecialty: true, description: "Creamy, a little rich, with that low, slow heat, finished with tender chicken strips" }
      ]
    },
    {
      category: "Extras & Sides",
      id: "sides",
      items: [
        { id: "side-nasigoreng", name: "Nasi Goreng Rice", price: 55, description: "Spiced Indonesian-style fried rice" },
        { id: "side-plainrice", name: "Plain Rice", price: 35, description: "Steamed jasmine white rice" }
      ]
    }
  ],
  addOns: [
    { id: "addon-milk", name: "Alternative Milk (Oat Milk, Almond Milk)", price: 30 },
    { id: "addon-syrup", name: "1 Pump Syrup (Vanilla, Hazelnut etc)", price: 30 },
    { id: "addon-shot", name: "Extra Espresso Shot", price: 40 }
  ],
  boardDisclaimer: "Prices are subject to change without prior notice due to fluctuations in raw ingredient costs, and customers who accidentally break any glassware will be responsible for covering the full replacement cost."
};
