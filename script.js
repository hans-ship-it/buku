import { db } from './firebase-config.js';
import {
    collection,
    addDoc,
    onSnapshot,
    doc,
    setDoc,
    query,
    orderBy
} from "https://www.gstatic.com/firebasejs/11.2.0/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', function () {
    // Inisialisasi variabel state lokal (akan disinkronkan dengan Firebase)
    let transactions = [];
    let anggotaData = [
        { id: 1, nama: 'Muhammad Zulkifli (230209501030)', totalIuran: 0, status: 'belum', history: [] },
        { id: 2, nama: 'Faiz Ramadhan (230209552007)', totalIuran: 0, status: 'belum', history: [] },
        { id: 3, nama: 'Reza Fathurrahman (230209501015)', totalIuran: 0, status: 'belum', history: [] },
        { id: 4, nama: 'Muh. Dimas Januardi Nur (230209501007)', totalIuran: 0, status: 'belum', history: [] },
        { id: 5, nama: 'Fardan Alsyah Muhram (230209502029)', totalIuran: 0, status: 'belum', history: [] }
    ];

    // Elemen DOM
    const iuranForm = document.getElementById('iuran-form');
    const pengeluaranForm = document.getElementById('pengeluaran-form');
    const searchInput = document.getElementById('search');
    const exportBtn = document.getElementById('export-excel');
    const printBtn = document.getElementById('print-buku');
    const notaInput = document.getElementById('nota-pengeluaran');
    const notaPreview = document.getElementById('nota-preview');
    const ledgerBody = document.getElementById('ledger-body');
    const anggotaStatusList = document.getElementById('anggota-status-list');

    // --- SETUP REAL-TIME LISTENERS ---

    // 1. Listen ke koleksi 'transactions'
    const q = query(collection(db, "transactions"), orderBy("tanggal", "desc"));
    const unsubscribeTransactions = onSnapshot(q, (snapshot) => {
        transactions = [];
        snapshot.forEach((doc) => {
            transactions.push({ id: doc.id, ...doc.data() });
        });

        // Update UI setiap kali ada perubahan data
        updateDashboard();
        updateLedger();
    }, (error) => {
        console.error("Error getting transactions: ", error);
        alert("Gagal memuat data transaksi dari server.");
    });

    // 2. Listen ke dokumen 'app_data/anggota'
    const unsubscribeAnggota = onSnapshot(doc(db, "app_data", "anggota"), (doc) => {
        if (doc.exists()) {
            // Jika data ada di database, gunakan itu
            anggotaData = doc.data().list;
        } else {
            // Jika belum ada (pertama kali), inisialisasi di database
            initializeAnggotaData();
        }
        updateAnggotaStatus();
    }, (error) => {
        console.error("Error getting anggota data: ", error);
    });

    // Inisialisasi data anggota di database jika kosong
    async function initializeAnggotaData() {
        try {
            await setDoc(doc(db, "app_data", "anggota"), {
                list: anggotaData
            });
            console.log("Anggota data initialized");
        } catch (e) {
            console.error("Error initializing anggota data: ", e);
        }
    }

    // --- END SETUP LISTENERS ---

    // Format mata uang
    function formatRupiah(angka) {
        if (!angka) return 'Rp 0';
        return 'Rp ' + angka.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    }

    // Update dashboard
    function updateDashboard() {
        let totalPemasukan = 0;
        let totalPengeluaran = 0;
        let saldo = 0;

        // Kita perlu menghitung ulang saldo dari awal waktu agar akurat,
        // Tapi transaksi sudah diurutkan dari DESC (terbaru).
        // Jadi kita balik dulu untuk perhitungan saldo berjalan yang benar dari lama ke baru.
        const sortedForCalc = [...transactions].sort((a, b) => new Date(a.tanggal) - new Date(b.tanggal));

        sortedForCalc.forEach((transaksi) => {
            if (transaksi.tipe === 'pemasukan') {
                totalPemasukan += transaksi.jumlah;
                saldo += transaksi.jumlah;
            } else if (transaksi.tipe === 'pengeluaran') {
                totalPengeluaran += transaksi.jumlah;
                saldo -= transaksi.jumlah;
            }
        });

        document.getElementById('saldo').textContent = formatRupiah(saldo);
        document.getElementById('total-pemasukan').textContent = formatRupiah(totalPemasukan);
        document.getElementById('total-pengeluaran').textContent = formatRupiah(totalPengeluaran);

        // Update mingguan
        updateSummaryMingguan();
    }

    // Update summary mingguan
    function updateSummaryMingguan() {
        const today = new Date();
        const startOfWeek = new Date(today);
        startOfWeek.setDate(today.getDate() - today.getDay());

        const mingguPemasukan = transactions
            .filter(t => t.tipe === 'pemasukan' && new Date(t.tanggal) >= startOfWeek)
            .reduce((sum, t) => sum + t.jumlah, 0);

        const mingguPengeluaran = transactions
            .filter(t => t.tipe === 'pengeluaran' && new Date(t.tanggal) >= startOfWeek)
            .reduce((sum, t) => sum + t.jumlah, 0);

        const mingguSaldo = mingguPemasukan - mingguPengeluaran;

        document.getElementById('minggu-pemasukan').textContent = formatRupiah(mingguPemasukan);
        document.getElementById('minggu-pengeluaran').textContent = formatRupiah(mingguPengeluaran);
        document.getElementById('minggu-saldo').textContent = formatRupiah(mingguSaldo);
    }

    // Update ledger buku kas
    function updateLedger() {
        ledgerBody.innerHTML = '';
        let runningSaldo = 0;

        // Hitung total saldo dulu
        const allTransactionsAsc = [...transactions].sort((a, b) => new Date(a.tanggal) - new Date(b.tanggal));

        // Kita butuh saldo berjalan untuk setiap baris.
        // Karena tampilan ledger descending (terbaru di atas), perhitungan saldo berjalan
        // sedikit tricky. Salah satu caranya adalah hitung dulu semua saldo per transaksi
        // dalam urutan ascending, lalu simpan nilainya, baru reverse untuk display.

        let tempSaldo = 0;
        const transactionsWithSaldo = allTransactionsAsc.map(t => {
            if (t.tipe === 'pemasukan') {
                tempSaldo += t.jumlah;
            } else {
                tempSaldo -= t.jumlah;
            }
            return { ...t, currentSaldo: tempSaldo };
        });

        // Balik lagi ke descending untuk tampilan
        const sortedTransactions = transactionsWithSaldo.reverse();

        sortedTransactions.forEach((transaksi, index) => {
            const row = document.createElement('div');
            row.className = 'ledger-row';
            row.innerHTML = `
                <div>${index + 1}</div>
                <div>${transaksi.tanggal}</div>
                <div>${transaksi.uraian || transaksi.keterangan || ''}</div>
                <div>${transaksi.tipe === 'pemasukan' ? formatRupiah(transaksi.jumlah) : '-'}</div>
                <div>${transaksi.tipe === 'pengeluaran' ? formatRupiah(transaksi.jumlah) : '-'}</div>
                <div>${formatRupiah(transaksi.currentSaldo)}</div>
                <div class="nota-cell">
                    ${transaksi.nota ?
                    `<img src="${transaksi.nota}" alt="Nota" onclick="viewImage('${transaksi.nota}')">` :
                    '-'}
                </div>
            `;
            ledgerBody.appendChild(row);
        });
    }

    // Update status anggota
    function updateAnggotaStatus() {
        anggotaStatusList.innerHTML = '';

        anggotaData.forEach(anggota => {
            const item = document.createElement('div');
            item.className = 'anggota-status-item';

            let statusClass = 'status-belum';
            let statusText = 'Belum Lunas';

            if (anggota.status === 'lunas') {
                statusClass = 'status-lunas';
                statusText = 'Lunas';
            } else if (anggota.status === 'sebagian') {
                statusClass = 'status-sebagian';
                statusText = 'Sebagian';
            }

            item.innerHTML = `
                <div class="anggota-nama">
                    <i class="fas fa-user"></i> ${anggota.nama}
                </div>
                <div class="anggota-info">
                    <span class="iuran-amount">${formatRupiah(anggota.totalIuran)}</span>
                    <span class="status-badge ${statusClass}">${statusText}</span>
                </div>
            `;
            anggotaStatusList.appendChild(item);
        });
    }

    // Handle form iuran anggota
    iuranForm.addEventListener('submit', async function (e) {
        e.preventDefault();

        const submitBtn = this.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> MENYIMPAN...';

        try {
            const tanggal = document.getElementById('tanggal-iuran').value;
            const mingguKe = document.getElementById('minggu-ke').value;
            const keterangan = document.getElementById('keterangan-iuran').value || `Iuran Minggu ${mingguKe}`;

            // Hitung total iuran dari semua anggota
            let totalIuran = 0;
            const anggotaHistory = [];

            // Clone anggotaData untuk modifikasi
            let updatedAnggotaData = JSON.parse(JSON.stringify(anggotaData));

            for (let i = 1; i <= 5; i++) {
                const iuranInput = document.getElementById(`iuran-anggota${i}`);
                const statusInput = document.getElementById(`status-anggota${i}`);

                if (iuranInput.value) {
                    const jumlah = parseInt(iuranInput.value) || 0;
                    if (jumlah > 0) {
                        totalIuran += jumlah;

                        // Update data anggota
                        const anggotaIndex = i - 1;
                        updatedAnggotaData[anggotaIndex].totalIuran += jumlah;

                        // AUTO-LUNAS LOGIC (berdasarkan total iuran)
                        let status = statusInput ? statusInput.value : 'sebagian';
                        if (updatedAnggotaData[anggotaIndex].totalIuran >= 10000) {
                            status = 'lunas';
                            if (statusInput) statusInput.value = 'lunas'; // Visual update
                        }

                        updatedAnggotaData[anggotaIndex].status = status;

                        // Tambahkan history
                        if (!updatedAnggotaData[anggotaIndex].history) updatedAnggotaData[anggotaIndex].history = [];
                        updatedAnggotaData[anggotaIndex].history.push({
                            tanggal,
                            minggu: mingguKe,
                            jumlah,
                            status: status
                        });

                        anggotaHistory.push({
                            nama: `Anggota ${i}`,
                            jumlah: jumlah,
                            status: status
                        });
                    }
                }
            }

            if (totalIuran > 0) {
                // 1. Simpan Transaksi ke Firestore
                const newTransaction = {
                    tanggal,
                    tipe: 'pemasukan',
                    uraian: `${keterangan} - Total: ${formatRupiah(totalIuran)}`,
                    keterangan: JSON.stringify(anggotaHistory),
                    jumlah: totalIuran,
                    nota: '',
                    kategori: 'iuran',
                    createdAt: new Date().toISOString()
                };

                await addDoc(collection(db, "transactions"), newTransaction);

                // 2. Update Data Anggota di Firestore
                await setDoc(doc(db, "app_data", "anggota"), {
                    list: updatedAnggotaData
                });

                // Reset form
                iuranForm.reset();
                document.getElementById('tanggal-iuran').value = new Date().toISOString().split('T')[0];

                alert(`Iuran berhasil disimpan ke Database! Total: ${formatRupiah(totalIuran)}`);
            } else {
                alert('Masukkan jumlah iuran minimal untuk satu anggota.');
            }
        } catch (error) {
            console.error("Error adding document: ", error);
            alert("Terjadi kesalahan saat menyimpan data: " + error.message);
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-save"></i> SIMPAN IURAN ANGGOTA';
        }
    });

    // Handle form Pemasukan Lain (NEW Feature)
    const pemasukanForm = document.getElementById('pemasukan-form');
    if (pemasukanForm) {
        pemasukanForm.addEventListener('submit', async function (e) {
            e.preventDefault();

            const submitBtn = this.querySelector('button[type="submit"]');
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> MENYIMPAN...';

            try {
                const tanggal = document.getElementById('tanggal-pemasukan').value;
                const jumlah = parseInt(document.getElementById('jumlah-pemasukan').value);
                const uraian = document.getElementById('uraian-pemasukan').value;
                const sumber = document.getElementById('sumber-dana').value;

                const newTransaction = {
                    tanggal,
                    tipe: 'pemasukan',
                    uraian: `${uraian}`,
                    keterangan: sumber ? `Sumber: ${sumber}` : 'Pemasukan Lain',
                    jumlah,
                    nota: '',
                    kategori: 'lainnya',
                    createdAt: new Date().toISOString()
                };

                await addDoc(collection(db, "transactions"), newTransaction);

                // Reset form
                pemasukanForm.reset();
                document.getElementById('tanggal-pemasukan').value = new Date().toISOString().split('T')[0];

                alert(`Pemasukan berhasil disimpan! ${formatRupiah(jumlah)}`);
            } catch (error) {
                console.error("Error adding document: ", error);
                alert("Terjadi kesalahan saat menyimpan data: " + error.message);
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fas fa-save"></i> SIMPAN PEMASUKAN';
            }
        });
    }

    // Handle form pengeluaran
    pengeluaranForm.addEventListener('submit', function (e) {
        e.preventDefault();

        const tanggal = document.getElementById('tanggal-pengeluaran').value;
        const jumlah = parseInt(document.getElementById('jumlah-pengeluaran').value);
        const uraian = document.getElementById('uraian-pengeluaran').value;
        const kategori = document.getElementById('kategori-pengeluaran').value;
        const penerima = document.getElementById('penerima').value;
        const catatan = document.getElementById('catatan-pengeluaran').value;
        let notaData = '';

        // Handle nota upload
        if (notaInput.files[0]) {
            const reader = new FileReader();
            reader.onload = function (e) {
                notaData = e.target.result;
                savePengeluaran(tanggal, jumlah, uraian, kategori, penerima, catatan, notaData);
            };
            reader.readAsDataURL(notaInput.files[0]);
        } else {
            savePengeluaran(tanggal, jumlah, uraian, kategori, penerima, catatan, '');
        }
    });

    async function savePengeluaran(tanggal, jumlah, uraian, kategori, penerima, catatan, nota) {
        const submitBtn = pengeluaranForm.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> MENYIMPAN...';

        try {
            const keterangan = [];
            if (penerima) keterangan.push(`Diberikan kepada: ${penerima}`);
            if (catatan) keterangan.push(`Catatan: ${catatan}`);

            const newTransaction = {
                tanggal,
                tipe: 'pengeluaran',
                uraian: `${uraian} (${getKategoriLabel(kategori)})`,
                keterangan: keterangan.join(' | '),
                jumlah,
                nota, // Base64 image
                kategori,
                penerima,
                catatan,
                createdAt: new Date().toISOString()
            };

            await addDoc(collection(db, "transactions"), newTransaction);

            // Reset form
            pengeluaranForm.reset();
            document.getElementById('tanggal-pengeluaran').value = new Date().toISOString().split('T')[0];
            notaPreview.style.display = 'none';

            alert(`Pengeluaran berhasil dicatat ke Database! ${formatRupiah(jumlah)}`);
        } catch (error) {
            console.error("Error adding document: ", error);
            alert("Terjadi kesalahan saat menyimpan data: " + error.message);
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-save"></i> SIMPAN PENGELUARAN';
        }
    }

    function getKategoriLabel(kategori) {
        const labels = {
            'alat-tulis': 'Alat Tulis',
            'fotocopy': 'Fotocopy',
            'transport': 'Transportasi',
            'konsumsi': 'Konsumsi',
            'alat-praktikum': 'Alat Praktikum',
            'lainnya': 'Lainnya'
        };
        return labels[kategori] || kategori;
    }

    // Preview gambar nota
    notaInput.addEventListener('change', function () {
        if (this.files[0]) {
            const reader = new FileReader();
            reader.onload = function (e) {
                notaPreview.src = e.target.result;
                notaPreview.style.display = 'block';
            };
            reader.readAsDataURL(this.files[0]);
        }
    });

    // Search transaksi
    searchInput.addEventListener('input', function () {
        const searchTerm = this.value.toLowerCase();
        const rows = document.querySelectorAll('.ledger-row:not(.ledger-header)');

        rows.forEach(row => {
            const text = row.textContent.toLowerCase();
            row.style.display = text.includes(searchTerm) ? 'grid' : 'none';
        });
    });

    // Export ke Excel
    exportBtn.addEventListener('click', function () {
        exportToExcel();
    });

    function exportToExcel() {
        // Siapkan data untuk Excel
        const excelData = [
            ['BUKU KAS ASISTENSI MENGAJAR', '', '', '', '', '', ''],
            ['Tanggal Export:', new Date().toLocaleDateString('id-ID'), '', '', '', '', ''],
            ['', '', '', '', '', '', ''],
            ['No', 'Tanggal', 'Uraian', 'Pemasukan', 'Pengeluaran', 'Saldo', 'Nota URL']
        ];

        let runningSaldo = 0;

        // Urutkan berdasarkan tanggal ASCENDING untuk hitung saldo di excel
        const sortedTransactions = [...transactions].sort((a, b) =>
            new Date(a.tanggal) - new Date(b.tanggal)
        );

        sortedTransactions.forEach((transaksi, index) => {
            if (transaksi.tipe === 'pemasukan') {
                runningSaldo += transaksi.jumlah;
            } else {
                runningSaldo -= transaksi.jumlah;
            }

            // Handle nota export - prevent huge base64 strings
            let notaExport = '';
            if (transaksi.nota) {
                // Cek apakah base64
                if (transaksi.nota.length > 1000) {
                    notaExport = 'Lihat di Aplikasi (Gambar Tersimpan)';
                } else {
                    notaExport = transaksi.nota;
                }
            }

            excelData.push([
                index + 1,
                transaksi.tanggal,
                transaksi.uraian || transaksi.keterangan || '',
                transaksi.tipe === 'pemasukan' ? transaksi.jumlah : '',
                transaksi.tipe === 'pengeluaran' ? transaksi.jumlah : '',
                runningSaldo,
                notaExport
            ]);
        });

        // Tambah summary
        excelData.push(['', '', '', '', '', '', '']);

        const totalPemasukan = transactions
            .filter(t => t.tipe === 'pemasukan')
            .reduce((sum, t) => sum + t.jumlah, 0);

        const totalPengeluaran = transactions
            .filter(t => t.tipe === 'pengeluaran')
            .reduce((sum, t) => sum + t.jumlah, 0);

        const saldo = totalPemasukan - totalPengeluaran;

        excelData.push(['', '', 'TOTAL PEMASUKAN', totalPemasukan, '', '', '']);
        excelData.push(['', '', 'TOTAL PENGELUARAN', '', totalPengeluaran, '', '']);
        excelData.push(['', '', 'SALDO AKHIR', '', '', saldo, '']);

        // Tambah data anggota
        excelData.push(['', '', '', '', '', '', '']);
        excelData.push(['STATUS IURAN ANGGOTA', '', '', '', '', '', '']);
        excelData.push(['Nama', 'Total Iuran', 'Status', '', '', '', '']);

        anggotaData.forEach(anggota => {
            excelData.push([
                anggota.nama,
                anggota.totalIuran,
                anggota.status === 'lunas' ? 'LUNAS' :
                    anggota.status === 'sebagian' ? 'SEBAGIAN' : 'BELUM LUNAS',
                '', '', '', ''
            ]);
        });

        // Buat worksheet
        const ws = XLSX.utils.aoa_to_sheet(excelData);

        // Sesuaikan lebar kolom
        const wscols = [
            { wch: 5 },   // No
            { wch: 12 },  // Tanggal
            { wch: 40 },  // Uraian
            { wch: 15 },  // Pemasukan
            { wch: 15 },  // Pengeluaran
            { wch: 15 },  // Saldo
            { wch: 50 }   // Nota URL
        ];
        ws['!cols'] = wscols;

        // Buat workbook
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Buku Kas');

        // Export
        const fileName = `Buku_Kas_Asistensi_${new Date().toISOString().split('T')[0]}.xlsx`;
        XLSX.writeFile(wb, fileName);
    }

    // Print buku kas
    printBtn.addEventListener('click', function () {
        window.print();
    });

    // Fungsi global untuk melihat gambar
    window.viewImage = function (imageSrc) {
        const modal = document.getElementById('image-modal');
        const modalImg = document.getElementById('modal-image');
        modal.style.display = 'block';
        modalImg.src = imageSrc;
    };

    // Set tanggal default
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('tanggal-iuran').value = today;
    document.getElementById('tanggal-pengeluaran').value = today;

    // Inisialisasi tidak perlu dipanggil manual lagi karena 
    // onSnapshot akan mentrigger update UI saat data pertama kali dimuat
});

// Tutup modal
document.addEventListener('DOMContentLoaded', function () {
    document.querySelector('.close').addEventListener('click', function () {
        document.getElementById('image-modal').style.display = 'none';
    });

    window.addEventListener('click', function (e) {
        const modal = document.getElementById('image-modal');
        if (e.target === modal) {
            modal.style.display = 'none';
        }
    });
});
