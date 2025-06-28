
        const firebaseConfig = {
            apiKey: "AIzaSyB8732VEzI4uhnkAo4S_pszN0abA4c4mS4",
            authDomain: "smart-parking-system-af097.firebaseapp.com",
            databaseURL: "https://smart-parking-system-af097-default-rtdb.firebaseio.com",
            projectId: "smart-parking-system-af097",
            storageBucket: "smart-parking-system-af097.firebasestorage.app",
            messagingSenderId: "877099531768",
            appId: "1:877099531768:web:d14b2a9575807187402a0d",
            measurementId: "G-N73E8JPQHC"
        };

        firebase.initializeApp(firebaseConfig);
        const database = firebase.database();
        const auth = firebase.auth();

        let currentUser = null;
        let parkingSpots = {};
        let userBookings = [];
        let spotsListener = null;

        function generateRandomQRData() {
            const transactionId = 'TXN' + Math.random().toString(36).substr(2, 9).toUpperCase();
            const paymentRef = 'PAY' + Date.now().toString(36).toUpperCase();
            return {
                transactionId: transactionId,
                paymentReference: paymentRef,
                amount: 50,
                spotId: document.getElementById('modalSpotId').textContent,
                timestamp: new Date().toISOString(),
                bankCode: Math.floor(Math.random() * 9000) + 1000,
                merchantId: 'NAVPARK' + Math.floor(Math.random() * 999),
                randomHash: btoa(Math.random().toString()).substr(0, 16)
            };
        }

        function login() {
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            
            if (!email || !password) {
                showError('Please enter both email and password');
                return;
            }

            auth.signInWithEmailAndPassword(email, password)
                .then((userCredential) => {
                    currentUser = userCredential.user;
                    showDashboard();
                    setupFirebaseListeners();
                })
                .catch((error) => {
                    showError('Login failed: ' + error.message);
                });
        }

        function register() {
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            
            if (!email || !password) {
                showError('Please enter both email and password');
                return;
            }

            if (password.length < 6) {
                showError('Password must be at least 6 characters');
                return;
            }

            auth.createUserWithEmailAndPassword(email, password)
                .then((userCredential) => {
                    currentUser = userCredential.user;
                    database.ref('users/' + currentUser.uid).set({
                        email: currentUser.email,
                        createdAt: firebase.database.ServerValue.TIMESTAMP,
                        bookings: {}
                    });
                    showDashboard();
                    setupFirebaseListeners();
                })
                .catch((error) => {
                    showError('Registration failed: ' + error.message);
                });
        }

        function logout() {
            auth.signOut().then(() => {
                currentUser = null;
                userBookings = [];
                if (spotsListener) {
                    spotsListener.off();
                    spotsListener = null;
                }
                document.getElementById('loginForm').classList.remove('hidden');
                document.getElementById('dashboard').classList.add('hidden');
                document.getElementById('userInfo').style.display = 'none';
                closeSidebar();
            });
        }

        function setupFirebaseListeners() {
            spotsListener = database.ref('Spots');
            spotsListener.on('value', (snapshot) => {
                parkingSpots = snapshot.val() || {};
                if (document.getElementById('sidebar').classList.contains('open')) {
                    displayParkingSpots();
                }
            });

            if (currentUser) {
                database.ref('users/' + currentUser.uid + '/bookings').on('value', (snapshot) => {
                    const bookingsData = snapshot.val() || {};
                    userBookings = Object.keys(bookingsData).map(key => ({
                        id: key,
                        ...bookingsData[key]
                    }));
                    updateUserBookings();
                });
            }
        }

        function showDashboard() {
            document.getElementById('loginForm').classList.add('hidden');
            document.getElementById('dashboard').classList.remove('hidden');
            document.getElementById('userInfo').style.display = 'flex';
            
            const displayName = currentUser.displayName || currentUser.email.split('@')[0];
            document.getElementById('userName').textContent = displayName;
            document.getElementById('userAvatar').textContent = displayName.charAt(0).toUpperCase();
            hideError();
            updateUserBookings();
        }

        function showError(message) {
            const errorDiv = document.getElementById('authError');
            errorDiv.textContent = message;
            errorDiv.classList.remove('hidden');
        }

        function hideError() {
            document.getElementById('authError').classList.add('hidden');
        }

        function openSidebar() {
            document.getElementById('sidebar').classList.add('open');
            loadParkingSpots();
        }

        function closeSidebar() {
            document.getElementById('sidebar').classList.remove('open');
        }

        function loadParkingSpots() {
            const spotsList = document.getElementById('spotsList');
            spotsList.innerHTML = '<div class="loading">Loading spots from Firebase...</div>';

            database.ref('Spots').once('value')
                .then((snapshot) => {
                    parkingSpots = snapshot.val() || {};
                    displayParkingSpots();
                })
                .catch((error) => {
                    spotsList.innerHTML = '<div class="error">Error loading parking spots. Please try again.</div>';
                });
        }

        function displayParkingSpots() {
    const spotsList = document.getElementById('spotsList');
    const sortOption = document.getElementById('sortOption')?.value || 'distance';
    spotsList.innerHTML = '';

    if (Object.keys(parkingSpots).length === 0) {
        spotsList.innerHTML = '<div class="loading">No parking spots available.</div>';
        return;
    }

    // 📍 Base coordinate: Bangalore (12.9716 N, 77.5946 E)
    const baseLat = 12.9716;
    const baseLng = 77.5946;

    // Helper to compute haversine distance between two coords
    function haversineDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; // Earth radius in km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) *
                  Math.sin(dLon/2) * Math.sin(dLon/2);
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    }

    let spotsArray = Object.keys(parkingSpots).map(spotId => {
        const spotData = parkingSpots[spotId];
        let distance = 0;
        if (spotData.coordinate && spotData.coordinate.length >= 2) {
            distance = haversineDistance(
                baseLat, baseLng,
                spotData.coordinate[0], spotData.coordinate[1]
            );
        }
        return {
            id: spotId,
            ...spotData,
            price: spotData.rate || 50,
            distance: distance
        };
    });

    spotsArray.sort((a, b) => sortOption === 'cost' ? a.price - b.price : a.distance - b.distance);

    spotsArray.forEach(spot => {
        const isAvailable = !spot.booked && !spot.occupied;
        const spotCard = document.createElement('div');
        spotCard.className = `spot-card ${!isAvailable ? 'booked' : ''}`;
        spotCard.innerHTML = `
            <div class="spot-header">
                <div class="spot-id">Spot ${spot.id}</div>
                <div class="status-badge ${isAvailable ? 'status-available' : 'status-booked'}">
                    ${isAvailable ? 'Available' : 'Unavailable'}
                </div>
            </div>
            <p>Price: ₹${spot.price}/hour • ${spot.distance.toFixed(1)} km away</p>
            ${spot.coordinate && spot.coordinate.length >= 2 ? `
                <p>Coordinates: ${spot.coordinate[0].toFixed(4)}, ${spot.coordinate[1].toFixed(4)}</p>` : ''}
            ${isAvailable ? `
                <button class="btn btn-primary" onclick="bookSpot('${spot.id}')" style="width: 100%; margin-top: 10px;">Book Now</button>
                <button class="btn btn-secondary" onclick="navigateToSpot('${spot.id}')" style="width: 100%; margin-top: 5px;">Navigate</button>
            ` : `
                <p style="margin-top: 10px; opacity: 0.8;">${spot.booked ? 'Already booked' : 'Currently occupied'}</p>
            `}
        `;
        spotsList.appendChild(spotCard);
    });
}


        function bookSpot(spotId) {
            document.getElementById('modalSpotId').textContent = spotId;
            document.getElementById('bookingModal').style.display = 'block';
            generateQRCode();
        }

        function generateQRCode() {
            const qrContainer = document.getElementById('qrCode');
            qrContainer.innerHTML = '';
            
            const qrData = generateRandomQRData();
            
            QRCode.toCanvas(qrContainer, JSON.stringify(qrData), {
                width: 200,
                height: 200,
                colorDark: '#000000',
                colorLight: '#ffffff'
            }, function (error) {
                if (error) console.error(error);
            });
        }

        function confirmBooking() {
            const spotId = document.getElementById('modalSpotId').textContent;
            
            if (!currentUser) {
                alert('Please log in to book a parking spot.');
                return;
            }
            
            const spot = parkingSpots[spotId];
            const price = Math.floor(Math.random() * 30) + 40; // Match the random price from display
            
            const spotRef = database.ref('Spots/' + spotId);
            spotRef.update({
                booked: true,
                bookedBy: currentUser.uid,
                bookedAt: firebase.database.ServerValue.TIMESTAMP
            }).then(() => {
                const bookingRef = database.ref('users/' + currentUser.uid + '/bookings').push();
                return bookingRef.set({
                    spotId: spotId,
                    timestamp: firebase.database.ServerValue.TIMESTAMP,
                    duration: 2,
                    price: price,
                    status: 'active'
                });
            }).then(() => {
                closeModal();
                closeSidebar();
                alert('Payment confirmed! You can now navigate to your parking spot.');
            }).catch((error) => {
                alert('Error confirming booking. Please try again.');
            });
        }

        function closeModal() {
            document.getElementById('bookingModal').style.display = 'none';
        }

        function navigateToSpot(spotId) {
            const spot = parkingSpots[spotId];
            if (spot && spot.coordinate && spot.coordinate.length >= 2) {
                const lat = spot.coordinate[0];
                const lng = spot.coordinate[1];
                const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
                window.open(mapsUrl, '_blank');
            } else {
                alert('Navigation coordinates not available for this spot.');
            }
        }

        function updateUserBookings() {
            const bookingsContainer = document.getElementById('userBookings');
            
            if (userBookings.length === 0) {
                bookingsContainer.innerHTML = '<p>No active bookings</p>';
                return;
            }
            
            bookingsContainer.innerHTML = userBookings.map(booking => `
                <div style="background: rgba(255, 255, 255, 0.1); padding: 15px; border-radius: 8px; margin-bottom: 10px; text-align: left; border: 1px solid rgba(255, 255, 255, 0.2);">
                    <strong>Spot ${booking.spotId}</strong><br>
                    Duration: ${booking.duration} hours<br>
                    Price: ₹${booking.price}<br>
                    Status: <span style="color: #00d4ff; font-weight: bold;">${booking.status}</span><br>
                    <button class="btn btn-secondary" onclick="navigateToSpot('${booking.spotId}')" style="margin-top: 8px; padding: 5px 10px; font-size: 12px;">
                        Navigate
                    </button>
                    ${booking.status === 'active' ? `
                        <button class="btn" onclick="endBooking('${booking.id || booking.spotId}')" style="margin-top: 8px; margin-left: 5px; padding: 5px 10px; font-size: 12px; background: #e53e3e; color: white;">
                            End Booking
                        </button>
                    ` : ''}
                </div>
            `).join('');
        }

        function endBooking(bookingId) {
            if (!currentUser) return;
            
            const booking = userBookings.find(b => b.id === bookingId || b.spotId === bookingId);
            if (!booking) return;
            
            database.ref('Spots/' + booking.spotId).update({
                booked: false,
                bookedBy: null,
                bookedAt: null
            }).then(() => {
                return database.ref('users/' + currentUser.uid + '/bookings/' + (booking.id || bookingId)).update({
                    status: 'completed',
                    endedAt: firebase.database.ServerValue.TIMESTAMP
                });
            }).then(() => {
                alert('Booking ended successfully!');
            }).catch((error) => {
                alert('Error ending booking. Please try again.');
            });
        }

        document.addEventListener('DOMContentLoaded', function() {
            auth.onAuthStateChanged((user) => {
                if (user) {
                    currentUser = user;
                    showDashboard();
                    setupFirebaseListeners();
                } else {
                    currentUser = null;
                    document.getElementById('loginForm').classList.remove('hidden');
                    document.getElementById('dashboard').classList.add('hidden');
                    document.getElementById('userInfo').style.display = 'none';
                }
            });
            
            window.onclick = function(event) {
                const modal = document.getElementById('bookingModal');
                if (event.target === modal) {
                    closeModal();
                }
            };
        });
    