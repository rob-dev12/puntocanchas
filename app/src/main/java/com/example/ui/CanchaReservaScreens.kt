package com.example.ui

import androidx.compose.animation.*
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.data.*
import com.example.ui.theme.*

@Composable
fun CanchaReservaAppContent(viewModel: CanchaReservaViewModel) {
    val currentScreen by viewModel.currentScreen.collectAsState()
    val uiMessage by viewModel.uiMessage.collectAsState()

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(SpaceBlack)
            .windowInsetsPadding(WindowInsets.safeDrawing)
    ) {
        Column(modifier = Modifier.fillMaxSize()) {
            // Main Top Bar
            CanchaTopHeader(viewModel = viewModel)

            // Dynamic Content Pane with Fade Transitions
            Box(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
            ) {
                AnimatedContent(
                    targetState = currentScreen,
                    transitionSpec = {
                        fadeIn(animationSpec = tween(220)) togetherWith fadeOut(animationSpec = tween(220))
                    },
                    label = "screen_transition"
                ) { screen ->
                    when (screen) {
                        is Screen.ComplexList -> ComplexListScreen(viewModel)
                        is Screen.ComplexDetail -> ComplexDetailScreen(screen.complex, viewModel)
                        is Screen.MatchList -> MatchListScreen(viewModel)
                        is Screen.MatchDetail -> MatchDetailScreen(screen.session, viewModel)
                        is Screen.CreateMatch -> CreateMatchScreen(screen.complex, viewModel)
                        is Screen.BookingHistory -> BookingHistoryScreen(viewModel)
                        is Screen.ProfileWallet -> ProfileWalletScreen(viewModel)
                    }
                }
            }

            // Bottom Navigation Bar
            CanchaBottomNav(
                currentScreen = currentScreen,
                onNavigate = { viewModel.navigateTo(it) }
            )
        }

        // Floating Animated Notification Banner / Toast
        AnimatedVisibility(
            visible = uiMessage != null,
            enter = slideInVertically(initialOffsetY = { -it }) + fadeIn(),
            exit = slideOutVertically(targetOffsetY = { -it }) + fadeOut(),
            modifier = Modifier
                .align(Alignment.TopCenter)
                .padding(top = 16.dp, start = 16.dp, end = 16.dp)
        ) {
            uiMessage?.let { msg ->
                Card(
                    colors = CardDefaults.cardColors(containerColor = NavyCardBg),
                    shape = RoundedCornerShape(16.dp),
                    elevation = CardDefaults.cardElevation(defaultElevation = 8.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .border(1.dp, ElectricLime.copy(alpha = 0.5f), RoundedCornerShape(16.dp))
                        .testTag("status_toast")
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(16.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            imageVector = if (msg.contains("Error")) Icons.Default.ErrorOutline else Icons.Default.CheckCircle,
                            contentDescription = "Estado",
                            tint = if (msg.contains("Error")) HotOrange else ElectricLime,
                            modifier = Modifier.size(24.dp)
                        )
                        Spacer(modifier = Modifier.width(12.dp))
                        Text(
                            text = msg,
                            color = PureWhite,
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.weight(1f)
                        )
                        IconButton(
                            onClick = { viewModel.clearMessage() },
                            modifier = Modifier.size(28.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Default.Close,
                                contentDescription = "Cerrar",
                                tint = MutedGrey,
                                modifier = Modifier.size(18.dp)
                            )
                        }
                    }
                }

                // Autoclear notification after 4 seconds
                LaunchedEffect(msg) {
                    kotlinx.coroutines.delay(4000)
                    viewModel.clearMessage()
                }
            }
        }
    }
}

@Composable
fun CanchaTopHeader(viewModel: CanchaReservaViewModel) {
    val profile by viewModel.userProfile.collectAsState()
    
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(DarkGreyNavy)
            .padding(horizontal = 20.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Column {
            Text(
                text = "Cancha Reserva",
                fontSize = 20.sp,
                fontWeight = FontWeight.Black,
                color = ElectricLime,
                letterSpacing = 0.5.sp
            )
            Text(
                text = "Partidos Exprés & Reservas",
                fontSize = 11.sp,
                fontWeight = FontWeight.Normal,
                color = MutedGrey
            )
        }

        // Wallet Balance Quick View button that takes you to the profile
        Row(
            modifier = Modifier
                .clip(RoundedCornerShape(20.dp))
                .background(SpaceBlack)
                .border(1.dp, NavyLightBorder, RoundedCornerShape(20.dp))
                .clickable { viewModel.navigateTo(Screen.ProfileWallet) }
                .padding(horizontal = 12.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                imageVector = Icons.Default.AccountBalanceWallet,
                contentDescription = "Wallet",
                tint = CyberTeal,
                modifier = Modifier.size(16.dp)
            )
            Spacer(modifier = Modifier.width(6.dp))
            Text(
                text = profile?.let { "CLP \$${String.format("%,d", it.walletBalance.toLong())}" } ?: "$0 CLP",
                color = PureWhite,
                fontSize = 12.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.testTag("top_header_wallet")
            )
        }
    }
}

@Composable
fun CanchaBottomNav(
    currentScreen: Screen,
    onNavigate: (Screen) -> Unit
) {
    NavigationBar(
        containerColor = DarkGreyNavy,
        tonalElevation = 8.dp,
        modifier = Modifier.windowInsetsPadding(WindowInsets.navigationBars)
    ) {
        NavigationBarItem(
            selected = currentScreen is Screen.ComplexList || currentScreen is Screen.ComplexDetail || currentScreen is Screen.CreateMatch,
            onClick = { onNavigate(Screen.ComplexList) },
            icon = { Icon(Icons.Default.SportsTennis, contentDescription = "Canchas") },
            label = { Text("Canchas", fontSize = 11.sp, fontWeight = FontWeight.Bold) },
            colors = NavigationBarItemDefaults.colors(
                selectedIconColor = SpaceBlack,
                selectedTextColor = ElectricLime,
                indicatorColor = ElectricLime,
                unselectedIconColor = MutedGrey,
                unselectedTextColor = MutedGrey
            ),
            modifier = Modifier.testTag("nav_item_complexes")
        )

        NavigationBarItem(
            selected = currentScreen is Screen.MatchList || currentScreen is Screen.MatchDetail,
            onClick = { onNavigate(Screen.MatchList) },
            icon = { Icon(Icons.Default.Groups, contentDescription = "Bolsa") },
            label = { Text("Partidos", fontSize = 11.sp, fontWeight = FontWeight.Bold) },
            colors = NavigationBarItemDefaults.colors(
                selectedIconColor = SpaceBlack,
                selectedTextColor = ElectricLime,
                indicatorColor = ElectricLime,
                unselectedIconColor = MutedGrey,
                unselectedTextColor = MutedGrey
            ),
            modifier = Modifier.testTag("nav_item_matches")
        )

        NavigationBarItem(
            selected = currentScreen is Screen.BookingHistory,
            onClick = { onNavigate(Screen.BookingHistory) },
            icon = { Icon(Icons.Default.ConfirmationNumber, contentDescription = "Mis Reservas") },
            label = { Text("Mis Partidos", fontSize = 11.sp, fontWeight = FontWeight.Bold) },
            colors = NavigationBarItemDefaults.colors(
                selectedIconColor = SpaceBlack,
                selectedTextColor = ElectricLime,
                indicatorColor = ElectricLime,
                unselectedIconColor = MutedGrey,
                unselectedTextColor = MutedGrey
            ),
            modifier = Modifier.testTag("nav_item_bookings")
        )

        NavigationBarItem(
            selected = currentScreen is Screen.ProfileWallet,
            onClick = { onNavigate(Screen.ProfileWallet) },
            icon = { Icon(Icons.Default.Person, contentDescription = "Monedero") },
            label = { Text("Monedero", fontSize = 11.sp, fontWeight = FontWeight.Bold) },
            colors = NavigationBarItemDefaults.colors(
                selectedIconColor = SpaceBlack,
                selectedTextColor = ElectricLime,
                indicatorColor = ElectricLime,
                unselectedIconColor = MutedGrey,
                unselectedTextColor = MutedGrey
            ),
            modifier = Modifier.testTag("nav_item_profile")
        )
    }
}

@Composable
fun SportIconBadge(sportType: String, modifier: Modifier = Modifier) {
    val (emoji, bgColor) = when (sportType) {
        "Fútbol" -> "⚽" to Color(0xFF10B981) // Green field
        "Pádel" -> "🎾" to Color(0xFF3B82F6)  // Blue glass court
        "Tenis" -> "🥎" to Color(0xFFEAB308)  // Yellow ball
        else -> "🏆" to Color(0xFF8B5CF6)
    }
    Box(
        modifier = modifier
            .size(44.dp)
            .background(bgColor.copy(alpha = 0.15f), shape = RoundedCornerShape(12.dp))
            .border(1.dp, bgColor.copy(alpha = 0.3f), shape = RoundedCornerShape(12.dp)),
        contentAlignment = Alignment.Center
    ) {
        Text(emoji, fontSize = 20.sp)
    }
}

// ----------------------------------------------------
// SCREEN 1: EXPLORE COMPLEXES / CANCHAS
// ----------------------------------------------------
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ComplexListScreen(viewModel: CanchaReservaViewModel) {
    val complexes by viewModel.complexes.collectAsState()
    var searchQuery by remember { mutableStateOf("") }
    var selectedSportFilter by remember { mutableStateOf("Todos") }

    val sports = listOf("Todos", "Fútbol", "Pádel", "Tenis")

    val filteredComplexes = complexes.filter { complex ->
        val matchesSearch = complex.name.contains(searchQuery, ignoreCase = true) ||
                complex.location.contains(searchQuery, ignoreCase = true)
        val matchesSport = selectedSportFilter == "Todos" || complex.sportType == selectedSportFilter
        matchesSearch && matchesSport
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp)
    ) {
        // Welcoming text
        Text(
            text = "Encuentra tu Cancha",
            fontSize = 24.sp,
            fontWeight = FontWeight.ExtraBold,
            color = PureWhite
        )
        Text(
            text = "Reserva canchas completas o divide el costo publicando partidos.",
            fontSize = 12.sp,
            color = MutedGrey,
            modifier = Modifier.padding(top = 2.dp, bottom = 16.dp)
        )

        // Custom Search OutlinedTextField
        OutlinedTextField(
            value = searchQuery,
            onValueChange = { searchQuery = it },
            placeholder = { Text("Buscar complejo o dirección...", color = MutedGrey) },
            prefix = { Icon(Icons.Default.Search, contentDescription = "Buscar", tint = MutedGrey, modifier = Modifier.padding(end = 6.dp)) },
            singleLine = true,
            shape = RoundedCornerShape(12.dp),
            colors = OutlinedTextFieldDefaults.colors(
                focusedContainerColor = DarkGreyNavy,
                unfocusedContainerColor = DarkGreyNavy,
                focusedBorderColor = ElectricLime,
                unfocusedBorderColor = NavyLightBorder,
                focusedTextColor = PureWhite,
                unfocusedTextColor = PureWhite
            ),
            modifier = Modifier
                .fillMaxWidth()
                .padding(bottom = 12.dp)
                .testTag("complex_search_input")
        )

        // Filter chips row
        Text(
            text = "Filtrar por deporte:",
            color = MutedGrey,
            fontSize = 12.sp,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(bottom = 6.dp)
        )

        FlowRow(
            modifier = Modifier
                .fillMaxWidth()
                .padding(bottom = 16.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            maxItemsInEachRow = 4
        ) {
            sports.forEach { sport ->
                val isSelected = selectedSportFilter == sport
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(12.dp))
                        .background(if (isSelected) ElectricLime else DarkGreyNavy)
                        .border(
                            width = 1.dp,
                            color = if (isSelected) ElectricLime else NavyLightBorder,
                            shape = RoundedCornerShape(12.dp)
                        )
                        .clickable { selectedSportFilter = sport }
                        .padding(horizontal = 14.dp, vertical = 8.dp)
                        .testTag("filter_chip_$sport"),
                    contentAlignment = Alignment.Center
                ) {
                    val labelEmoji = when (sport) {
                        "Fútbol" -> "⚽ Fútbol"
                        "Pádel" -> "🎾 Pádel"
                        "Tenis" -> "🥎 Tenis"
                        else -> "🔥 Todos"
                    }
                    Text(
                        text = labelEmoji,
                        color = if (isSelected) SpaceBlack else PureWhite,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold
                    )
                }
            }
        }

        // Complexes list
        if (filteredComplexes.isEmpty()) {
            Box(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth(),
                contentAlignment = Alignment.Center
            ) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    modifier = Modifier.padding(24.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.SportsTennis,
                        contentDescription = "Empty list",
                        tint = MutedGrey.copy(alpha = 0.5f),
                        modifier = Modifier.size(54.dp)
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    Text(
                        text = "No se encontraron complejos",
                        color = PureWhite,
                        fontWeight = FontWeight.Bold,
                        textAlign = TextAlign.Center
                    )
                    Text(
                        text = "Intenta buscar de otra manera o cambiando el filtro.",
                        color = MutedGrey,
                        fontSize = 11.sp,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.padding(top = 4.dp)
                    )
                }
            }
        } else {
            LazyColumn(
                verticalArrangement = Arrangement.spacedBy(14.dp),
                modifier = Modifier.weight(1f)
            ) {
                items(filteredComplexes) { complex ->
                    ComplexCard(complex = complex, onClick = {
                        viewModel.navigateTo(Screen.ComplexDetail(complex))
                    })
                }
            }
        }
    }
}

@Composable
fun ComplexCard(complex: SportComplex, onClick: () -> Unit) {
    Card(
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = NavyCardBg),
        modifier = Modifier
            .fillMaxWidth()
            .border(1.dp, NavyLightBorder, RoundedCornerShape(16.dp))
            .clickable(onClick = onClick)
            .testTag("complex_card_${complex.id}")
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                SportIconBadge(sportType = complex.sportType)
                
                // Rating element
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier
                        .background(SpaceBlack, shape = RoundedCornerShape(8.dp))
                        .padding(horizontal = 8.dp, vertical = 4.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.Star,
                        contentDescription = "Estrellas",
                        tint = Color(0xFFFFBF00),
                        modifier = Modifier.size(14.dp)
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(
                        text = complex.rating.toString(),
                        color = PureWhite,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Black
                    )
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            Text(
                text = complex.name,
                color = PureWhite,
                fontSize = 18.sp,
                fontWeight = FontWeight.Bold
            )
            
            Row(
                modifier = Modifier.padding(vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(
                    imageVector = Icons.Default.Place,
                    contentDescription = "Dirección",
                    tint = MutedGrey,
                    modifier = Modifier.size(14.dp)
                )
                Spacer(modifier = Modifier.width(4.dp))
                Text(
                    text = complex.location,
                    color = MutedGrey,
                    fontSize = 12.sp,
                    maxLines = 1
                )
            }

            HorizontalDivider(
                color = NavyLightBorder,
                modifier = Modifier.padding(vertical = 12.dp)
            )

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text(
                        text = "Valor completo / hora:",
                        color = MutedGrey,
                        fontSize = 11.sp
                    )
                    Text(
                        text = "CLP \$${String.format("%,d", complex.pricePerHour.toLong())}",
                        color = CyberTeal,
                        fontSize = 16.sp,
                        fontWeight = FontWeight.ExtraBold
                    )
                }

                Button(
                    onClick = onClick,
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = ElectricLime)
                ) {
                    Text(
                        text = "Ver Canchas",
                        color = SpaceBlack,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.ExtraBold
                    )
                }
            }
        }
    }
}

// ----------------------------------------------------
// SCREEN 2: COMPLEX DETAIL & SELECTIONS
// ----------------------------------------------------
@Composable
fun ComplexDetailScreen(complex: SportComplex, viewModel: CanchaReservaViewModel) {
    var selectedTime by remember { mutableStateOf<String?>(null) }
    val walletProfile by viewModel.userProfile.collectAsState()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp)
    ) {
        // Back Header Button
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier
                .clickable { viewModel.navigateTo(Screen.ComplexList) }
                .padding(vertical = 8.dp)
        ) {
            Icon(Icons.Default.ArrowBack, contentDescription = "Regresar", tint = ElectricLime)
            Spacer(modifier = Modifier.width(8.dp))
            Text("Regresar al listado", color = ElectricLime, fontSize = 14.sp, fontWeight = FontWeight.Bold)
        }

        Spacer(modifier = Modifier.height(12.dp))

        // Title Area Card
        Card(
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = NavyCardBg),
            modifier = Modifier
                .fillMaxWidth()
                .border(2.dp, NavyLightBorder, RoundedCornerShape(16.dp))
        ) {
            Row(
                modifier = Modifier.padding(16.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                SportIconBadge(sportType = complex.sportType)
                Spacer(modifier = Modifier.width(16.dp))
                Column {
                    Text(
                        text = complex.name,
                        fontSize = 20.sp,
                        fontWeight = FontWeight.ExtraBold,
                        color = PureWhite
                    )
                    Text(
                        text = complex.location,
                        fontSize = 12.sp,
                        color = MutedGrey
                    )
                    Text(
                        text = "Deporte: ${complex.sportType} | Hora: \$${String.format("%,d", complex.pricePerHour.toLong())} CLP",
                        fontSize = 11.sp,
                        color = CyberTeal,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(top = 4.dp)
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(20.dp))

        // Step 1: Select available time
        Text(
            text = "1. Selecciona un Horario Disponible",
            fontSize = 16.sp,
            fontWeight = FontWeight.ExtraBold,
            color = PureWhite
        )

        val timesAvailable = complex.getAvailableTimes()

        if (timesAvailable.isEmpty()) {
            Card(
                colors = CardDefaults.cardColors(containerColor = NavyCardBg.copy(alpha = 0.5f)),
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 12.dp)
                    .border(1.dp, NavyLightBorder, RoundedCornerShape(12.dp))
            ) {
                Text(
                    text = "No quedan canchas disponibles para reservar hoy en este complejo.",
                    color = HotOrange,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(20.dp)
                )
            }
        } else {
            // Display standard grid-like blocks
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 12.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                timesAvailable.forEach { hr ->
                    val isSelected = selectedTime == hr
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .clip(RoundedCornerShape(12.dp))
                            .background(if (isSelected) ElectricLime else NavyCardBg)
                            .border(
                                1.dp,
                                if (isSelected) ElectricLime else NavyLightBorder,
                                RoundedCornerShape(12.dp)
                            )
                            .clickable { selectedTime = hr }
                            .padding(vertical = 14.dp)
                            .testTag("time_slot_button_$hr"),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = "$hr:00",
                            color = if (isSelected) SpaceBlack else PureWhite,
                            fontSize = 14.sp,
                            fontWeight = FontWeight.ExtraBold
                        )
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(12.dp))

        if (selectedTime != null) {
            val hourValue = selectedTime!!
            
            Text(
                text = "2. Elige tu Modalidad de Reserva",
                fontSize = 16.sp,
                fontWeight = FontWeight.ExtraBold,
                color = PureWhite
            )
            Text(
                text = "Puedes coordinar el partido por tu cuenta o permitir que otros se sumen para dividir gastos.",
                fontSize = 11.sp,
                color = MutedGrey,
                modifier = Modifier.padding(bottom = 12.dp)
            )

            // Split Option 1: Full Booking Card
            Card(
                shape = RoundedCornerShape(14.dp),
                colors = CardDefaults.cardColors(containerColor = NavyCardBg),
                modifier = Modifier
                    .fillMaxWidth()
                    .border(1.dp, NavyLightBorder, RoundedCornerShape(14.dp))
                    .padding(bottom = 12.dp)
                    .testTag("booking_type_full_option")
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(14.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = "Reservar Cancha Completa 🏟️",
                            fontWeight = FontWeight.Bold,
                            color = PureWhite,
                            fontSize = 15.sp
                        )
                        Text(
                            text = "Pagas la totalidad de la hora (\$${String.format("%,d", complex.pricePerHour.toLong())} CLP). La cancha queda cerrada para ti y tus amigos.",
                            color = MutedGrey,
                            fontSize = 11.sp,
                            modifier = Modifier.padding(top = 2.dp)
                        )
                    }
                    Button(
                        onClick = { viewModel.bookFullCourt(complex, hourValue) },
                        colors = ButtonDefaults.buttonColors(containerColor = CyberTeal),
                        shape = RoundedCornerShape(10.dp),
                        modifier = Modifier
                            .padding(start = 12.dp)
                            .testTag("action_book_full")
                    ) {
                        Text("Pagar", color = SpaceBlack, fontWeight = FontWeight.Bold, fontSize = 12.sp)
                    }
                }
            }

            // Split Option 2: Express Matchmaking split card!
            Card(
                shape = RoundedCornerShape(14.dp),
                colors = CardDefaults.cardColors(containerColor = NavyCardBg),
                modifier = Modifier
                    .fillMaxWidth()
                    .border(2.dp, ElectricLime.copy(alpha = 0.5f), RoundedCornerShape(14.dp))
                    .testTag("booking_type_split_option")
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(14.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(
                                text = "Organizar Partido Exprés ⚡",
                                fontWeight = FontWeight.Bold,
                                color = ElectricLime,
                                fontSize = 15.sp
                            )
                            Spacer(modifier = Modifier.width(6.dp))
                            Box(
                                modifier = Modifier
                                    .background(HotOrange, shape = RoundedCornerShape(100.dp))
                                    .padding(horizontal = 6.dp, vertical = 2.dp)
                            ) {
                                Text("DIVIDIR", color = PureWhite, fontSize = 9.sp, fontWeight = FontWeight.Black)
                            }
                        }
                        
                        val slots = when (complex.sportType) {
                            "Pádel" -> 4
                            "Tenis" -> 4
                            else -> 10
                        }
                        val shareCost = complex.pricePerHour / slots

                        Text(
                            text = "Sube el cupo de jugadores faltantes a la bolsa. Pagas solo tu porción (\$${String.format("%,d", shareCost.toLong())} CLP) y la app cobra de forma garantizada a los terceros.",
                            color = MutedGrey,
                            fontSize = 11.sp,
                            modifier = Modifier.padding(top = 2.dp)
                        )
                    }
                    
                    Button(
                        onClick = { viewModel.navigateTo(Screen.CreateMatch(complex)) },
                        colors = ButtonDefaults.buttonColors(containerColor = ElectricLime),
                        shape = RoundedCornerShape(10.dp),
                        modifier = Modifier
                            .padding(start = 12.dp)
                            .testTag("action_setup_split")
                    ) {
                        Text("Configurar", color = SpaceBlack, fontWeight = FontWeight.Black, fontSize = 12.sp)
                    }
                }
            }
        }
    }
}

// ----------------------------------------------------
// SCREEN 3: CREATE MATCH (SET PARAMETERS FOR EXPRESS SPLIT)
// ----------------------------------------------------
@Composable
fun CreateMatchScreen(complex: SportComplex, viewModel: CanchaReservaViewModel) {
    val timesAvailable = complex.getAvailableTimes()
    var selectedHr by remember { mutableStateOf(timesAvailable.firstOrNull() ?: "18:00") }
    var descriptionInput by remember { mutableStateOf("") }
    
    // slots defaults depending on sport
    val defaultSlots = if (complex.sportType == "Fútbol") 10 else 4
    var slotsSliderValue by remember { mutableStateOf(defaultSlots.toFloat()) }
    
    val totalSlots = slotsSliderValue.toInt()
    val personalCost = complex.pricePerHour / totalSlots

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp)
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier
                .clickable { viewModel.navigateTo(Screen.ComplexDetail(complex)) }
                .padding(vertical = 8.dp)
        ) {
            Icon(Icons.Default.ArrowBack, contentDescription = "Regresar", tint = ElectricLime)
            Spacer(modifier = Modifier.width(8.dp))
            Text("Regresar al complejo", color = ElectricLime, fontSize = 14.sp, fontWeight = FontWeight.Bold)
        }

        Spacer(modifier = Modifier.height(12.dp))

        Text(
            text = "Crear Partido Exprés ⚡",
            fontSize = 22.sp,
            fontWeight = FontWeight.ExtraBold,
            color = PureWhite
        )
        Text(
            text = "Publica los cupos libres. Tu reserva se activará debitando solo tu cuota, y el resto quedará disponible para que otros deportistas compren online.",
            fontSize = 12.sp,
            color = MutedGrey,
            modifier = Modifier.padding(top = 2.dp, bottom = 16.dp)
        )

        Card(
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = NavyCardBg),
            modifier = Modifier
                .fillMaxWidth()
                .border(1.dp, NavyLightBorder, RoundedCornerShape(16.dp))
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                // Info Section
                Text(
                    text = complex.name,
                    color = PureWhite,
                    fontWeight = FontWeight.Bold,
                    fontSize = 16.sp
                )
                Text(
                    text = "${complex.sportType} | Complejo ${complex.location}",
                    fontSize = 12.sp,
                    color = MutedGrey
                )

                HorizontalDivider(color = NavyLightBorder, modifier = Modifier.padding(vertical = 12.dp))

                // Time selector state inside creation
                Text(
                    text = "Selecciona horario definitivo:",
                    color = MutedGrey,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold
                )
                Spacer(modifier = Modifier.height(6.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    timesAvailable.forEach { hr ->
                        val isSelected = selectedHr == hr
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(8.dp))
                                .background(if (isSelected) ElectricLime else SpaceBlack)
                                .border(1.dp, if (isSelected) ElectricLime else NavyLightBorder, RoundedCornerShape(8.dp))
                                .clickable { selectedHr = hr }
                                .padding(horizontal = 12.dp, vertical = 8.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                text = "$hr:00",
                                color = if (isSelected) SpaceBlack else PureWhite,
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }
                }

                HorizontalDivider(color = NavyLightBorder, modifier = Modifier.padding(vertical = 12.dp))

                // Slider for slots count
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(
                        text = "Cantidad total de jugadores:",
                        color = MutedGrey,
                        fontSize = 12.sp
                    )
                    Text(
                        text = "$totalSlots Jugadores",
                        color = ElectricLime,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Black
                    )
                }

                Slider(
                    value = slotsSliderValue,
                    onValueChange = { slotsSliderValue = it },
                    valueRange = if (complex.sportType == "Fútbol") 4f..14f else 4f..4f, // Paddle/tennis normally always 4 players doubles
                    colors = SliderDefaults.colors(
                        thumbColor = ElectricLime,
                        activeTrackColor = ElectricLime,
                        inactiveTrackColor = SpaceBlack
                    ),
                    modifier = Modifier.testTag("players_slots_slider")
                )

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(
                        text = "Cupo para mí: 1 (Creador)",
                        color = SoftGrey,
                        fontSize = 12.sp
                    )
                    Text(
                        text = "Vacantes públicas: ${totalSlots - 1}",
                        color = CyberTeal,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold
                    )
                }

                HorizontalDivider(color = NavyLightBorder, modifier = Modifier.padding(vertical = 12.dp))

                // Input message
                Text(
                    text = "Añade un comentario motivacional o nivel de juego:",
                    color = MutedGrey,
                    fontSize = 12.sp,
                    modifier = Modifier.padding(bottom = 6.dp)
                )
                OutlinedTextField(
                    value = descriptionInput,
                    onValueChange = { descriptionInput = it },
                    placeholder = { Text("Ej: Partido recreativo, nivel intermedio 4ta. Buscamos central o delantero...", color = MutedGrey, fontSize = 12.sp) },
                    shape = RoundedCornerShape(10.dp),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedContainerColor = SpaceBlack,
                        unfocusedContainerColor = SpaceBlack,
                        focusedBorderColor = CyberTeal,
                        unfocusedBorderColor = NavyLightBorder,
                        focusedTextColor = PureWhite,
                        unfocusedTextColor = PureWhite
                    ),
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(80.dp)
                        .testTag("match_desc_input")
                )

                HorizontalDivider(color = NavyLightBorder, modifier = Modifier.padding(vertical = 12.dp))

                // Split pricing details
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(SpaceBlack, RoundedCornerShape(12.dp))
                        .padding(12.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column {
                        Text(
                            text = "Tu cuota a pagar:",
                            color = MutedGrey,
                            fontSize = 11.sp
                        )
                        Text(
                            text = "CLP \$${String.format("%,d", personalCost.toLong())}",
                            color = ElectricLime,
                            fontSize = 18.sp,
                            fontWeight = FontWeight.Black
                        )
                    }
                    Column(horizontalAlignment = Alignment.End) {
                        Text(
                            text = "Costo Total Cancha:",
                            color = MutedGrey,
                            fontSize = 11.sp
                        )
                        Text(
                            text = "CLP \$${String.format("%,d", complex.pricePerHour.toLong())}",
                            color = PureWhite,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold,
                            textAlign = TextAlign.End
                        )
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))

                // Submit Button
                Button(
                    onClick = {
                        viewModel.createMatchSession(
                            complex = complex,
                            scheduleTime = selectedHr,
                            description = descriptionInput,
                            slotsTotal = totalSlots
                        )
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = ElectricLime),
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(50.dp)
                        .testTag("btn_submit_co_pay_match")
                ) {
                    Icon(Icons.Default.FlashOn, contentDescription = "Crear", tint = SpaceBlack)
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        text = "Publicar y Pagar Mi Parte",
                        color = SpaceBlack,
                        fontWeight = FontWeight.Black,
                        fontSize = 14.sp
                    )
                }
            }
        }
    }
}

// ----------------------------------------------------
// SCREEN 4: DISCOVER & JOIN MATCHES (BOLSA PARTIDOS)
// ----------------------------------------------------
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun MatchListScreen(viewModel: CanchaReservaViewModel) {
    val matches by viewModel.matchSessions.collectAsState()
    var selectedSportFilter by remember { mutableStateOf("Todos") }
    val sports = listOf("Todos", "Fútbol", "Pádel", "Tenis")

    val filteredMatches = matches.filter { match ->
        selectedSportFilter == "Todos" || match.sportType == selectedSportFilter
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp)
    ) {
        Text(
            text = "Partidos Exprés ⚡",
            fontSize = 24.sp,
            fontWeight = FontWeight.ExtraBold,
            color = PureWhite
        )
        Text(
            text = "Grupos que necesitan jugadores para completar el partido. Súmate pagando únicamente tu cuota proporcional.",
            fontSize = 12.sp,
            color = MutedGrey,
            modifier = Modifier.padding(top = 2.dp, bottom = 14.dp)
        )

        // Filter chips row
        FlowRow(
            modifier = Modifier
                .fillMaxWidth()
                .padding(bottom = 16.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            maxItemsInEachRow = 4
        ) {
            sports.forEach { sport ->
                val isSelected = selectedSportFilter == sport
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(12.dp))
                        .background(if (isSelected) ElectricLime else DarkGreyNavy)
                        .border(
                            width = 1.dp,
                            color = if (isSelected) ElectricLime else NavyLightBorder,
                            shape = RoundedCornerShape(12.dp)
                        )
                        .clickable { selectedSportFilter = sport }
                        .padding(horizontal = 14.dp, vertical = 8.dp)
                        .testTag("match_filter_${sport}"),
                    contentAlignment = Alignment.Center
                ) {
                    val labelText = when (sport) {
                        "Fútbol" -> "⚽ Fútbol"
                        "Pádel" -> "🎾 Pádel"
                        "Tenis" -> "🥎 Tenis"
                        else -> "🔥 Todos"
                    }
                    Text(
                        text = labelText,
                        color = if (isSelected) SpaceBlack else PureWhite,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold
                    )
                }
            }
        }

        // List
        if (filteredMatches.isEmpty()) {
            Box(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth(),
                contentAlignment = Alignment.Center
            ) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    modifier = Modifier.padding(24.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.Groups,
                        contentDescription = "Empty",
                        tint = MutedGrey.copy(alpha = 0.5f),
                        modifier = Modifier.size(54.dp)
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    Text(
                        text = "No hay partidos en busca de jugadores",
                        color = PureWhite,
                        fontWeight = FontWeight.Bold,
                        textAlign = TextAlign.Center
                    )
                    Text(
                        text = "Crea un partido tú mismo en la solapa Canchas para publicar un nuevo cupo libre.",
                        color = MutedGrey,
                        fontSize = 11.sp,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.padding(top = 4.dp)
                    )
                }
            }
        } else {
            LazyColumn(
                verticalArrangement = Arrangement.spacedBy(14.dp),
                modifier = Modifier.weight(1f)
            ) {
                items(filteredMatches) { match ->
                    MatchSessionCard(match = match, onClick = {
                        viewModel.navigateTo(Screen.MatchDetail(match))
                    })
                }
            }
        }
    }
}

@Composable
fun MatchSessionCard(match: MatchSession, onClick: () -> Unit) {
    val isFull = match.slotsTaken >= match.slotsTotal
    val spotsLeft = match.slotsTotal - match.slotsTaken

    Card(
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = NavyCardBg),
        modifier = Modifier
            .fillMaxWidth()
            .border(1.dp, if (spotsLeft == 1 && !isFull) HotOrange.copy(alpha = 0.6f) else NavyLightBorder, RoundedCornerShape(16.dp))
            .clickable(onClick = onClick)
            .testTag("match_card_${match.id}")
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            // Header: complex name, category badge
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    SportIconBadge(sportType = match.sportType)
                    Spacer(modifier = Modifier.width(10.dp))
                    Column {
                        Text(
                            text = match.complexName,
                            color = PureWhite,
                            fontWeight = FontWeight.Bold,
                            fontSize = 15.sp
                        )
                        Text(
                            text = "Organizado por ${match.creatorName}",
                            color = MutedGrey,
                            fontSize = 11.sp
                        )
                    }
                }

                // Sports Tag Category
                Box(
                    modifier = Modifier
                        .background(DarkGreyNavy, RoundedCornerShape(6.dp))
                        .padding(horizontal = 8.dp, vertical = 4.dp)
                ) {
                    Text(
                        text = match.schedule,
                        color = CyberTeal,
                        fontWeight = FontWeight.Bold,
                        fontSize = 10.sp
                    )
                }
            }

            Spacer(modifier = Modifier.height(10.dp))

            // Text description
            Text(
                text = "\"${match.description}\"",
                fontSize = 13.sp,
                fontWeight = FontWeight.Normal,
                color = SoftGrey,
                modifier = Modifier.padding(bottom = 12.dp)
            )

            // Graphical Slots tracker
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Cupos:",
                    color = MutedGrey,
                    fontSize = 12.sp,
                    modifier = Modifier.width(48.dp)
                )

                // Split Slot indicator circles
                Row(
                    modifier = Modifier.weight(1f),
                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    for (i in 0 until match.slotsTotal) {
                        val isFilled = i < match.slotsTaken
                        Box(
                            modifier = Modifier
                                .weight(1f)
                                .height(8.dp)
                                .clip(RoundedCornerShape(4.dp))
                                .background(
                                    if (isFilled) ElectricLime else SpaceBlack
                                )
                                .border(
                                    width = 1.dp,
                                    color = if (isFilled) ElectricLime else NavyLightBorder,
                                    shape = RoundedCornerShape(4.dp)
                                )
                        )
                    }
                }

                Spacer(modifier = Modifier.width(8.dp))

                Text(
                    text = "${match.slotsTaken}/${match.slotsTotal}",
                    color = PureWhite,
                    fontWeight = FontWeight.Black,
                    fontSize = 13.sp
                )
            }

            // Alerts / status tag
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 8.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                if (isFull) {
                    Text(
                        text = "⚽ Partido Completo",
                        color = MutedGrey,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold
                    )
                } else if (spotsLeft == 1) {
                    Text(
                        text = "🔥 ¡Falta SOLO 1 CUPO!",
                        color = HotOrange,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Black
                    )
                } else {
                    Text(
                        text = "👍 Faltan $spotsLeft jugadores",
                        color = CyberTeal,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold
                    )
                }

                // Split price box
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(horizontalAlignment = Alignment.End) {
                        Text(
                            text = "Pagas tu parte:",
                            color = MutedGrey,
                            fontSize = 10.sp
                        )
                        Text(
                            text = "CLP \$${String.format("%,d", match.pricePerPlayer.toLong())}",
                            color = ElectricLime,
                            fontSize = 15.sp,
                            fontWeight = FontWeight.Black
                        )
                    }
                }
            }
        }
    }
}

// ----------------------------------------------------
// SCREEN 5: MATCH DETAIL & PLAYER COPAY OR CHECKIN
// ----------------------------------------------------
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun MatchDetailScreen(session: MatchSession, viewModel: CanchaReservaViewModel) {
    val isFull = session.slotsTaken >= session.slotsTotal
    val playerList = session.getJoinedPlayerNames()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp)
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier
                .clickable { viewModel.navigateTo(Screen.MatchList) }
                .padding(vertical = 8.dp)
        ) {
            Icon(Icons.Default.ArrowBack, contentDescription = "Regresar", tint = ElectricLime)
            Spacer(modifier = Modifier.width(8.dp))
            Text("Regresar a la bolsa", color = ElectricLime, fontSize = 14.sp, fontWeight = FontWeight.Bold)
        }

        Spacer(modifier = Modifier.height(12.dp))

        Text(
            text = "Detalle del Partido Exprés",
            fontSize = 22.sp,
            fontWeight = FontWeight.ExtraBold,
            color = PureWhite
        )
        Text(
            text = "Aquí puedes unirte a este partido pagando únicamente tu cuota dividida.",
            fontSize = 12.sp,
            color = MutedGrey
        )

        Spacer(modifier = Modifier.height(14.dp))

        Card(
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = NavyCardBg),
            modifier = Modifier
                .fillMaxWidth()
                .border(1.dp, NavyLightBorder, RoundedCornerShape(16.dp))
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    SportIconBadge(sportType = session.sportType)
                    Spacer(modifier = Modifier.width(12.dp))
                    Column {
                        Text(
                            text = session.complexName,
                            fontSize = 18.sp,
                            fontWeight = FontWeight.Bold,
                            color = PureWhite
                        )
                        Text(
                            text = "Horario: ${session.schedule}",
                            fontSize = 12.sp,
                            color = CyberTeal,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }

                HorizontalDivider(color = NavyLightBorder, modifier = Modifier.padding(vertical = 12.dp))

                Text(
                    text = "Mensaje del organizador:",
                    fontSize = 11.sp,
                    color = MutedGrey,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    text = "\"${session.description}\"",
                    fontSize = 13.sp,
                    color = SoftGrey,
                    modifier = Modifier.padding(vertical = 4.dp)
                )

                HorizontalDivider(color = NavyLightBorder, modifier = Modifier.padding(vertical = 12.dp))

                // Occupancy tracker circles
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "Cupos ocupados:",
                        color = MutedGrey,
                        fontSize = 12.sp
                    )
                    Text(
                        text = "${session.slotsTaken} de ${session.slotsTotal} Jugadores",
                        color = PureWhite,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Bold
                    )
                }

                Spacer(modifier = Modifier.height(8.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    for (i in 0 until session.slotsTotal) {
                        val isFilled = i < session.slotsTaken
                        Box(
                            modifier = Modifier
                                .weight(1f)
                                .height(8.dp)
                                .clip(RoundedCornerShape(4.dp))
                                .background(
                                    if (isFilled) ElectricLime else SpaceBlack
                                )
                                .border(
                                    1.dp,
                                    if (isFilled) ElectricLime else NavyLightBorder,
                                    RoundedCornerShape(4.dp)
                                )
                        )
                    }
                }

                HorizontalDivider(color = NavyLightBorder, modifier = Modifier.padding(vertical = 12.dp))

                // List players in the match
                Text(
                    text = "Equipo conformado hasta el momento:",
                    fontSize = 11.sp,
                    color = MutedGrey,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(bottom = 6.dp)
                )

                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    playerList.forEachIndexed { idx, player ->
                        val isHost = idx == 0
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(8.dp))
                                .background(if (isHost) ElectricLime.copy(alpha = 0.1f) else SpaceBlack)
                                .border(
                                    width = 1.dp,
                                    color = if (isHost) ElectricLime else NavyLightBorder,
                                    shape = RoundedCornerShape(8.dp)
                                )
                                .padding(horizontal = 10.dp, vertical = 6.dp)
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(
                                    text = if (isHost) "👑 $player" else "🏃 $player",
                                    color = if (isHost) ElectricLime else PureWhite,
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Bold
                                )
                            }
                        }
                    }
                }

                HorizontalDivider(color = NavyLightBorder, modifier = Modifier.padding(vertical = 12.dp))

                // Price panel co pay
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(SpaceBlack, RoundedCornerShape(12.dp))
                        .padding(12.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column {
                        Text(
                            text = "Tu total a pagar:",
                            color = MutedGrey,
                            fontSize = 11.sp
                        )
                        Text(
                            text = "CLP \$${String.format("%,d", session.pricePerPlayer.toLong())}",
                            color = ElectricLime,
                            fontSize = 18.sp,
                            fontWeight = FontWeight.Black
                        )
                    }
                    Box(
                        modifier = Modifier
                            .background(CyberTeal.copy(alpha = 0.15f), RoundedCornerShape(4.dp))
                            .padding(horizontal = 8.dp, vertical = 4.dp)
                    ) {
                        Text(
                            text = "Cuota Dividida Automática",
                            color = CyberTeal,
                            fontSize = 10.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))

                // Join CTA button
                Button(
                    onClick = { viewModel.joinMatchSession(session) },
                    enabled = !isFull,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = ElectricLime,
                        disabledContainerColor = NavyLightBorder
                    ),
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(50.dp)
                        .testTag("match_join_btn")
                ) {
                    if (isFull) {
                        Text(
                            text = "Partido Completo",
                            color = MutedGrey,
                            fontWeight = FontWeight.Bold,
                            fontSize = 14.sp
                        )
                    } else {
                        Icon(Icons.Default.CreditCard, contentDescription = "Pagar", tint = SpaceBlack)
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(
                            text = "Pagar mi parte y Unirme",
                            color = SpaceBlack,
                            fontWeight = FontWeight.Black,
                            fontSize = 14.sp
                        )
                    }
                }
            }
        }
    }
}

// ----------------------------------------------------
// SCREEN 6: BOOKINGS HISTORY & TICKET SYSTEM
// ----------------------------------------------------
@Composable
fun BookingHistoryScreen(viewModel: CanchaReservaViewModel) {
    val bookings by viewModel.bookings.collectAsState()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp)
    ) {
        Text(
            text = "Mis Canchas e Inscripciones",
            fontSize = 24.sp,
            fontWeight = FontWeight.ExtraBold,
            color = PureWhite
        )
        Text(
            text = "Accede a tus comprobantes de canchas reservadas o partidos exprés activos.",
            fontSize = 12.sp,
            color = MutedGrey,
            modifier = Modifier.padding(top = 2.dp, bottom = 16.dp)
        )

        if (bookings.isEmpty()) {
            Box(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth(),
                contentAlignment = Alignment.Center
            ) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    modifier = Modifier.padding(24.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.ConfirmationNumber,
                        contentDescription = "No tickets yet",
                        tint = MutedGrey.copy(alpha = 0.4f),
                        modifier = Modifier.size(54.dp)
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    Text(
                        text = "Aún no tienes actividad reciente",
                        color = PureWhite,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        text = "Las canchas completas que reserves o partidos exprés a los que te unas aparecerán en esta sección en forma de tickets.",
                        color = MutedGrey,
                        fontSize = 11.sp,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.padding(top = 4.dp)
                    )
                }
            }
        } else {
            LazyColumn(
                verticalArrangement = Arrangement.spacedBy(16.dp),
                modifier = Modifier.weight(1f)
            ) {
                items(bookings) { booking ->
                    BookingTicketItem(booking = booking)
                }
            }
        }
    }
}

// Visual layout simulating a high-end tear-off entry coupon ticket! Include dashed path drawings
@Composable
fun BookingTicketItem(booking: Booking) {
    // Generate a unique ticket reference code depending on booking.id
    val ticketCode = "CR-${(1000 + booking.id * 179) % 10000}X"

    Card(
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = NavyCardBg),
        modifier = Modifier
            .fillMaxWidth()
            .border(1.dp, NavyLightBorder, RoundedCornerShape(16.dp))
            .testTag("booking_ticket_${booking.id}")
    ) {
        // We draw the card background with custom dashed tear-off line in the middle
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .drawBehind {
                    val strokeWidth = 2.dp.toPx()
                    val pathEffect = PathEffect.dashPathEffect(floatArrayOf(10f, 10f), 0f)
                    val y = size.height * 0.65f

                    // Draw left-right indentation circle overlays conceptually, or a beautiful grey dividing dotted path:
                    drawLine(
                        color = NavyLightBorder,
                        start = Offset(16.dp.toPx(), y),
                        end = Offset(size.width - 16.dp.toPx(), y),
                        strokeWidth = strokeWidth,
                        pathEffect = pathEffect
                    )
                }
        ) {
            Column {
                // PART A: Main Event details
                Column(modifier = Modifier.padding(16.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            SportIconBadge(sportType = booking.sportType)
                            Spacer(modifier = Modifier.width(10.dp))
                            Column {
                                Text(
                                    text = booking.complexName,
                                    color = PureWhite,
                                    fontSize = 16.sp,
                                    fontWeight = FontWeight.Bold
                                )
                                Text(
                                    text = "Deporte: ${booking.sportType}",
                                    color = MutedGrey,
                                    fontSize = 11.sp
                                )
                            }
                        }

                        // Type badge
                        val badgeColor = if (booking.bookingType.contains("Cancha")) CyberTeal else ElectricLime
                        Box(
                            modifier = Modifier
                                .background(badgeColor.copy(alpha = 0.15f), RoundedCornerShape(6.dp))
                                .border(1.dp, badgeColor.copy(alpha = 0.4f), RoundedCornerShape(6.dp))
                                .padding(horizontal = 8.dp, vertical = 4.dp)
                        ) {
                            Text(
                                text = booking.bookingType,
                                color = badgeColor,
                                fontSize = 9.sp,
                                fontWeight = FontWeight.Black
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(14.dp))

                    // Date & Schedule
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            imageVector = Icons.Default.Event,
                            contentDescription = "Calendario",
                            tint = CyberTeal,
                            modifier = Modifier.size(16.dp)
                        )
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(
                            text = booking.schedule,
                            color = SoftGrey,
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }

                // Wait, some empty spacing to give space around the dotted divider
                Spacer(modifier = Modifier.height(30.dp))

                // PART B: Billing and validation code (below the tear-off line)
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(DarkGreyNavy)
                        .padding(16.dp)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column {
                            Text(
                                text = "MONTO DEBITADO",
                                color = MutedGrey,
                                fontSize = 9.sp,
                                fontWeight = FontWeight.Bold,
                                letterSpacing = 0.5.sp
                            )
                            Text(
                                text = "CLP \$${String.format("%,d", booking.pricePaid.toLong())}",
                                color = ElectricLime,
                                fontSize = 15.sp,
                                fontWeight = FontWeight.Black
                            )
                        }

                        Column(horizontalAlignment = Alignment.End) {
                            Text(
                                text = "CÓDIGO DE RESERVA",
                                color = MutedGrey,
                                fontSize = 9.sp,
                                fontWeight = FontWeight.Bold,
                                letterSpacing = 0.5.sp
                            )
                            Text(
                                text = ticketCode,
                                color = PureWhite,
                                fontFamily = FontFamily.Monospace,
                                fontSize = 14.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }
                }
            }
        }
    }
}

// ----------------------------------------------------
// SCREEN 7: PROFILE & WALLET BALANCE MANAGEMENT
// ----------------------------------------------------
@Composable
fun ProfileWalletScreen(viewModel: CanchaReservaViewModel) {
    val profile by viewModel.userProfile.collectAsState()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp)
    ) {
        Text(
            text = "Perfil & Monedero",
            fontSize = 24.sp,
            fontWeight = FontWeight.ExtraBold,
            color = PureWhite
        )
        Text(
            text = "Administra tu saldo virtual y accede a tus configuraciones personales.",
            fontSize = 12.sp,
            color = MutedGrey,
            modifier = Modifier.padding(top = 2.dp, bottom = 16.dp)
        )

        // profile detail card
        Card(
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = NavyCardBg),
            modifier = Modifier
                .fillMaxWidth()
                .border(1.dp, NavyLightBorder, RoundedCornerShape(16.dp))
        ) {
            Row(
                modifier = Modifier.padding(16.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Simulating modern player avatar
                Box(
                    modifier = Modifier
                        .size(50.dp)
                        .background(ElectricLime.copy(alpha = 0.2f), shape = RoundedCornerShape(25.dp))
                        .border(1.5.dp, ElectricLime, shape = RoundedCornerShape(25.dp)),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = profile?.name?.firstOrNull()?.toString() ?: "C",
                        color = ElectricLime,
                        fontSize = 22.sp,
                        fontWeight = FontWeight.Black
                    )
                }

                Spacer(modifier = Modifier.width(16.dp))

                Column {
                    Text(
                        text = profile?.name ?: "Usuario",
                        fontSize = 16.sp,
                        fontWeight = FontWeight.ExtraBold,
                        color = PureWhite
                    )
                    Text(
                        text = profile?.email ?: "usuario@canchareserva.cl",
                        fontSize = 12.sp,
                        color = MutedGrey
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(20.dp))

        // Virtual Card mockup
        Text(
            text = "Tarjeta Digital Cancha Reserva",
            fontSize = 14.sp,
            fontWeight = FontWeight.Bold,
            color = MutedGrey,
            modifier = Modifier.padding(bottom = 8.dp)
        )

        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(180.dp)
                .clip(RoundedCornerShape(20.dp))
                .background(
                    Brush.linearGradient(
                        colors = listOf(DarkGreyNavy, NavyCardBg, SpaceBlack),
                        start = Offset(0f, 0f),
                        end = Offset(Float.MAX_VALUE, Float.MAX_VALUE)
                    )
                )
                .border(2.dp, CyberTeal.copy(alpha = 0.8f), RoundedCornerShape(20.dp))
                .testTag("digital_wallet_card")
        ) {
            // Chip graphics
            Box(
                modifier = Modifier
                    .padding(20.dp)
                    .size(36.dp, 26.dp)
                    .background(Color(0xFFFFD700).copy(alpha = 0.6f), RoundedCornerShape(4.dp))
            )

            // Balance
            Column(
                modifier = Modifier
                    .align(Alignment.CenterStart)
                    .padding(start = 20.dp, top = 20.dp)
            ) {
                Text(
                    text = "SALDO DISPONIBLE",
                    fontSize = 10.sp,
                    color = MutedGrey,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 1.sp
                )
                Text(
                    text = profile?.let { "CLP \$${String.format("%,d", it.walletBalance.toLong())}" } ?: "$0 CLP",
                    fontSize = 28.sp,
                    fontWeight = FontWeight.Black,
                    color = ElectricLime,
                    modifier = Modifier.testTag("wallet_balance_text")
                )
            }

            // Card details
            Row(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .padding(20.dp)
                    .fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "CARLOS MÁRMOL",
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                    color = PureWhite,
                    letterSpacing = 1.sp
                )
                Text(
                    text = "CR CARD •••• 4392",
                    fontSize = 11.sp,
                    fontFamily = FontFamily.Monospace,
                    color = SoftGrey
                )
            }
        }

        Spacer(modifier = Modifier.height(20.dp))

        // Recharge Funds Title
        Text(
            text = "Recargar Fondos Simulado",
            fontSize = 16.sp,
            fontWeight = FontWeight.Bold,
            color = PureWhite
        )
        Text(
            text = "Añade saldo instantáneo a tu monedero para simular tus transacciones deportivas.",
            fontSize = 11.sp,
            color = MutedGrey,
            modifier = Modifier.padding(bottom = 12.dp)
        )

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            listOf(5000.0, 10000.0, 20000.0).forEach { amount ->
                Button(
                    onClick = { viewModel.addFunds(amount) },
                    colors = ButtonDefaults.buttonColors(containerColor = NavyCardBg),
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier
                        .weight(1f)
                        .border(1.dp, NavyLightBorder, RoundedCornerShape(12.dp))
                        .testTag("btn_recharge_${amount.toInt()}"),
                    contentPadding = PaddingValues(vertical = 12.dp)
                ) {
                    Text(
                        text = "+\$${String.format("%,d", amount.toLong())}",
                        color = CyberTeal,
                        fontWeight = FontWeight.Black,
                        fontSize = 13.sp
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        // Small notification details
        Card(
            shape = RoundedCornerShape(12.dp),
            colors = CardDefaults.cardColors(containerColor = DarkGreyNavy.copy(alpha = 0.5f)),
            modifier = Modifier
                .fillMaxWidth()
                .border(1.dp, NavyLightBorder, RoundedCornerShape(12.dp))
        ) {
            Row(
                modifier = Modifier.padding(12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(Icons.Default.VerifiedUser, contentDescription = "Safe payment", tint = CyberTeal, modifier = Modifier.size(18.dp))
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = "El dinero retenido para partidos exprés se transfiere automáticamente al complejo deportivo una vez que se completan los cupos requeridos.",
                    color = MutedGrey,
                    fontSize = 11.sp,
                    modifier = Modifier.weight(1f)
                )
            }
        }
    }
}
