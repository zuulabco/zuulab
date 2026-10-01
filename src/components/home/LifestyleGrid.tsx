import Image from 'next/image'
import Link from 'next/link'
import styles from './LifestyleGrid.module.css'

export default function LifestyleGrid() {
  return (
    <section className={styles.section} aria-label="yaşam alanlarından zuulab kareleri">
      <div className={styles.container}>
        {/* Asymmetric Editorial Composition */}
        <div className={styles.grid}>
          {/* Tile 1: Typographic Editorial Statement */}
          <div className={styles.textTile}>
            <h2 className={styles.heading}>
              mekana karakter katan formlar.
            </h2>
            <p className={styles.desc}>
              kullanıcılarımızın evlerinden, çocuk odalarından ve çalışma alanlarından 
              objelerimizin günlük yaşamdaki duruşu.
            </p>
            <a
              href="https://instagram.com/zuulab"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.instaLink}
            >
              <span>@zuulab instagram</span>
              <span className={styles.arrow} aria-hidden>→</span>
            </a>
          </div>

          {/* Tile 2: Tall Interior Visual */}
          <div className={`${styles.imageTile} ${styles.tall}`}>
            <Image
              src="https://images.unsplash.com/photo-1618220179428-22790b461013?auto=format&fit=crop&w=1000&q=85"
              alt="zuulab parametrik dekorasyon formu yaşam alanında"
              fill
              sizes="(max-width: 900px) 100vw, 40vw"
              className={styles.img}
              loading="lazy"
            />
          </div>

          {/* Tile 3: Landscape Workspace Visual */}
          <div className={`${styles.imageTile} ${styles.landscape}`}>
            <Image
              src="https://images.unsplash.com/photo-1593062096033-9a26b09da705?auto=format&fit=crop&w=1200&q=85"
              alt="zuulab çalışma alanı masa organizeri"
              fill
              sizes="(max-width: 900px) 100vw, 55vw"
              className={styles.img}
              loading="lazy"
            />
            <span className={styles.imageLabel}>masan için düzen</span>
          </div>

          {/* Tile 4: Ambient Lamp Visual */}
          <div className={`${styles.imageTile} ${styles.square}`}>
            <Image
              src="https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=800&q=85"
              alt="zuulight gece aydınlatması"
              fill
              sizes="(max-width: 900px) 50vw, 30vw"
              className={styles.img}
              loading="lazy"
            />
            <span className={styles.imageLabel}>zuulight lithophane</span>
          </div>
        </div>
      </div>
    </section>
  )
}
