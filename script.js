let map;
let marker;
let userMarker;
let directionsService;
let directionsRenderer;
let searchBox;
let destination;
let userLocation;
let streetViewService;
let streetViewPanorama;
let journeyInterval;
let trafficLayer;
let transitLayer;
let activePolylines = []; // Store references to polylines

function initMap() {
  map = new google.maps.Map(document.getElementById("map"), {
    center: { lat: 37.7749, lng: -122.4194 }, // Default center
    zoom: 13,
    streetViewControl: true, // Enable Street View control
  });

  marker = new google.maps.Marker({ map: map });

  // Initialize directions service and renderer
  directionsService = new google.maps.DirectionsService();
  directionsRenderer = new google.maps.DirectionsRenderer({
    map: map,
    suppressMarkers: true,
    polylineOptions: {
      strokeColor: "#ff6b6b",
      strokeOpacity: 0.7,
      strokeWeight: 5,
    },
  });

  // Initialize the search box with autocomplete
  const input = document.getElementById("searchBox");
  searchBox = new google.maps.places.Autocomplete(input);

  map.addListener("bounds_changed", () => {
    searchBox.setBounds(map.getBounds());
  });

  searchBox.addListener("place_changed", () => {
    const place = searchBox.getPlace();
    if (!place.geometry) return;

    destination = place.geometry.location;
    map.setCenter(destination);
    marker.setPosition(destination);

    showNotification("Destination set! Ready to start your journey?");
    displayPlaceDetails(place);
  });

  streetViewService = new google.maps.StreetViewService();
  streetViewPanorama = new google.maps.StreetViewPanorama(
    document.getElementById("street-view")
  );

  trafficLayer = new google.maps.TrafficLayer();
  transitLayer = new google.maps.TransitLayer();

  getUserLocation();
}

function getUserLocation() {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        userLocation = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };

        map.setCenter(userLocation);
        map.setZoom(14);
        if (userMarker) userMarker.setMap(null);
        userMarker = new google.maps.Marker({
          position: userLocation,
          map: map,
          title: "You are here",
          icon: {
            url: "http://maps.google.com/mapfiles/ms/icons/blue-dot.png",
          },
        });

        showNotification(
          "Location found! Starting from your current position."
        );
        displayCurrentLocationDetails();
      },
      (error) => {
        const errorMessages = {
          1: "Permission denied. Please allow location access.",
          2: "Position unavailable. Please try again later.",
          3: "Request timed out. Please try again.",
        };
        showNotification(
          errorMessages[error.code] || "Unable to retrieve location."
        );
      }
    );
  } else {
    showNotification("Geolocation is not supported by this browser.");
  }
}

function startJourney() {
  if (!userLocation || !destination) {
    showNotification(
      "Please ensure both current location and destination are set."
    );
    return;
  }

  calculateRoute(userLocation, destination);

  journeyInterval = setInterval(() => updateRouteWithRandomDetour(), 30000);
  trackUserLocation();
}

function pauseJourney() {
  if (journeyInterval) {
    clearInterval(journeyInterval);
    journeyInterval = null;
    showNotification("Journey paused.");
  }
}

function resetJourney() {
  if (journeyInterval) {
    clearInterval(journeyInterval);
    journeyInterval = null;
  }
  directionsRenderer.set("directions", null);
  if (userMarker) userMarker.setMap(null);
  userLocation = null;
  destination = null;
  clearActivePolylines();
  showNotification("Journey reset.");
}

function toggleLayer(layer, layerName) {
  if (layer.getMap()) {
    layer.setMap(null);
    showNotification(`${layerName} hidden.`);
  } else {
    layer.setMap(map);
    showNotification(`${layerName} shown.`);
  }
}

function toggleTrafficLayer() {
  toggleLayer(trafficLayer, "Traffic layer");
}

function toggleTransitLayer() {
  toggleLayer(transitLayer, "Transit layer");
}

function calculateRoute(origin, destination) {
  const request = {
    origin: origin,
    destination: destination,
    travelMode: google.maps.TravelMode.DRIVING,
    drivingOptions: {
      departureTime: new Date(),
      trafficModel: "bestguess",
    },
  };

  directionsService.route(request, (result, status) => {
    if (status === google.maps.DirectionsStatus.OK) {
      directionsRenderer.setDirections(result);
      clearActivePolylines();
      colorRouteBasedOnTraffic(result);
      displayRouteInfo(result, google.maps.TravelMode.DRIVING);
    } else {
      showNotification("Failed to calculate route. Please try again.");
    }
  });
}

function colorRouteBasedOnTraffic(result) {
  const route = result.routes[0].legs[0];
  const trafficColors = {
    UNKNOWN: "#808080",
    LIGHT: "#00FF00",
    MODERATE: "#FFFF00",
    HEAVY: "#FF0000",
    SEVERE: "#800000",
  };

  route.steps.forEach((step) => {
    const trafficCondition =
      step.traffic_speed_entry?.[0]?.traffic_speed_condition || "UNKNOWN";
    const polyline = new google.maps.Polyline({
      path: step.path,
      strokeColor: trafficColors[trafficCondition],
      strokeOpacity: 0.7,
      strokeWeight: 5,
      map: map,
    });
    activePolylines.push(polyline);
  });
}

function clearActivePolylines() {
  activePolylines.forEach((polyline) => polyline.setMap(null));
  activePolylines = [];
}

function updateRouteWithRandomDetour() {
  if (!userLocation || !destination) return;

  const detour = generateRandomDetours(userLocation)[0];

  const request = {
    origin: userLocation,
    destination: destination,
    waypoints: [{ location: detour, stopover: true }],
    travelMode: google.maps.TravelMode.DRIVING,
    drivingOptions: {
      departureTime: new Date(),
      trafficModel: "bestguess",
    },
  };

  directionsService.route(request, (result, status) => {
    if (status === google.maps.DirectionsStatus.OK) {
      directionsRenderer.setDirections(result);
      clearActivePolylines();
      colorRouteBasedOnTraffic(result);
      showNotification("Detour added to your journey!");
      displayDirectionsInstructions(result);
    } else {
      showNotification("Failed to update route with detour. Please try again.");
    }
  });
}

function generateRandomDetours(currentLocation) {
  const detours = [];
  const radius = 0.001;

  for (let i = 0; i < 3; i++) {
    const angle = Math.random() * 2 * Math.PI;
    const dx = radius * Math.cos(angle);
    const dy = radius * Math.sin(angle);
    const detourLat = currentLocation.lat + dx;
    const detourLng = currentLocation.lng + dy;
    detours.push({ lat: detourLat, lng: detourLng });
  }

  return detours;
}

function trackUserLocation() {
  if (navigator.geolocation) {
    navigator.geolocation.watchPosition(
      (position) => {
        const newLocation = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        userMarker.setPosition(newLocation);
        map.panTo(newLocation);
        userLocation = newLocation;
        displayCurrentLocationDetails();
      },
      (error) => {
        console.error("Error tracking location:", error);
        showNotification("Location tracking error.");
      }
    );
  }
}

function displayRouteInfo(result, mode) {
  const route = result.routes[0].legs[0];
  const modeName = mode.charAt(0).toUpperCase() + mode.slice(1).toLowerCase();
  const infoContainer = document.getElementById("route-info");
  infoContainer.innerHTML = `
    <h4>${modeName}</h4>
    <p>Distance: ${route.distance.text}</p>
    <p>Duration: ${route.duration.text}</p>
  `;
}

function displayDirectionsInstructions(directions) {
  const stepsContainer = document.getElementById("steps");
  stepsContainer.innerHTML = "";
  const route = directions.routes[0].legs[0];

  route.steps.forEach((step, index) => {
    const stepDiv = document.createElement("div");
    stepDiv.textContent = `${index + 1}. ${step.instructions} (${
      step.distance.text
    })`;
    stepsContainer.appendChild(stepDiv);
  });
}

function displayPlaceDetails(place) {
  const detailsContainer = document.getElementById("place-details");
  detailsContainer.innerHTML = `
    <h3>${place.name || "Unknown Place"}</h3>
    <p>${place.formatted_address || "No address available"}</p>
    ${place.rating ? `<p>Rating: ${place.rating}</p>` : ""}
    ${
      place.formatted_phone_number
        ? `<p>${place.formatted_phone_number}</p>`
        : ""
    }
    ${
      place.website
        ? `<p><a href="${place.website}" target="_blank">Website</a></p>`
        : ""
    }
  `;

  if (place.photos && place.photos.length > 0) {
    const photoUrl = place.photos[0].getUrl({ maxWidth: 200, maxHeight: 200 });
    detailsContainer.innerHTML += `<img src="${photoUrl}" alt="Place photo">`;
  }
}

function displayCurrentLocationDetails() {
  const locationContainer = document.getElementById("current-location");
  locationContainer.textContent = `Current location: Lat ${userLocation.lat.toFixed(
    5
  )}, Lng ${userLocation.lng.toFixed(5)}`;
}

function showNotification(message) {
  const notificationContainer = document.getElementById("notification");
  notificationContainer.textContent = message;
  setTimeout(() => {
    notificationContainer.textContent = "";
  }, 5000);
}
