import { AnnouncementBadge } from '@/components/elements/announcement-badge'
import { ButtonLink, PlainButtonLink } from '@/components/elements/button'
import { Main } from '@/components/elements/main'
import { ChevronIcon } from '@/components/icons/chevron-icon'
import { GitDiffIcon } from '@/components/icons/git-diff-icon'
import { HeartIcon } from '@/components/icons/heart-icon'
import { RocketIcon } from '@/components/icons/rocket-icon'
import { StarIcon } from '@/components/icons/star-icon'
import { TargetIcon } from '@/components/icons/target-icon'
import { User2Icon } from '@/components/icons/user-2-icon'
import { BrandCard, BrandsCardsMultiColumn } from '@/components/sections/brands-cards-multi-column'
import { CallToActionSimple } from '@/components/sections/call-to-action-simple'
import { Feature, FeaturesThreeColumn } from '@/components/sections/features-three-column'
import { FooterCategory, FooterLink, FooterWithLinkCategories } from '@/components/sections/footer-with-link-categories'
import { HeroTwoColumnWithPhoto } from '@/components/sections/hero-two-column-with-photo'
import {
  NavbarLink,
  NavbarLogo,
  NavbarWithLogoActionsAndCenteredLinks,
} from '@/components/sections/navbar-with-logo-actions-and-centered-links'
import { TeamMember, TeamThreeColumnGrid } from '@/components/sections/team-three-column-grid'

export default function Page() {
  return (
    <>
      <NavbarWithLogoActionsAndCenteredLinks
        id="navbar"
        links={
          <>
            <NavbarLink href="#">Pricing</NavbarLink>
            <NavbarLink href="#">About</NavbarLink>
            <NavbarLink href="#">Docs</NavbarLink>
            <NavbarLink href="#" className="sm:hidden">
              Log in
            </NavbarLink>
          </>
        }
        logo={
          <NavbarLogo href="#">
            <img
              src="https://assets.tailwindplus.com/logos/oatmeal-mona.svg?color=mist-950"
              alt="Oatmeal"
              className="dark:hidden"
              width={113}
              height={28}
            />
            <img
              src="https://assets.tailwindplus.com/logos/oatmeal-mona.svg?color=white"
              alt="Oatmeal"
              className="not-dark:hidden"
              width={113}
              height={28}
            />
          </NavbarLogo>
        }
        actions={
          <>
            <PlainButtonLink href="#" className="max-sm:hidden">
              Log in
            </PlainButtonLink>
            <ButtonLink href="#">Get started</ButtonLink>
          </>
        }
      />

      <Main>
        {/* Hero */}
        <HeroTwoColumnWithPhoto
          id="hero"
          eyebrow={<AnnouncementBadge href="#" text="2025 Business of the Year" cta="Learn more" />}
          headline="Your customer success is our mission."
          subheadline={
            <p>
              We're on a mission to take the human element completely out of customer support — so your team can focus
              on what matters most, profitability.
            </p>
          }
          photo={
            <>
              <img
                className="not-dark:bg-white/75 max-xl:hidden dark:bg-black/75"
                src="https://assets.tailwindplus.com/photos/1.webp"
                width={1800}
                height={1600}
                alt=""
              />
              <img
                className="not-dark:bg-white/75 xl:hidden dark:bg-black/75"
                src="https://assets.tailwindplus.com/photos/1.webp"
                width={1800}
                height={945}
                alt=""
              />
            </>
          }
        />

        {/* Brands */}
        <BrandsCardsMultiColumn
          id="brands"
          eyebrow="Backed by the best"
          headline="Funded by leading investors."
          subheadline={
            <p>
              Oatmeal is backed by investors with decades of experience building the world's most boring and predictable
              B2B SaaS.
            </p>
          }
        >
          <BrandCard
            logo={
              <>
                <img
                  src="https://assets.tailwindplus.com/logos/15.svg?color=black&width=110"
                  className="dark:hidden"
                  alt=""
                  width={124}
                  height={32}
                />
                <img
                  src="https://assets.tailwindplus.com/logos/15.svg?color=white&width=110"
                  className="not-dark:hidden"
                  alt=""
                  width={124}
                  height={32}
                />
              </>
            }
            text="Focused capital for founders building the next generation of pyramid shaped businesses."
            footnote="Investor in Anomaly, Concise, Haptic and more."
          />
          <BrandCard
            logo={
              <>
                <img
                  src="https://assets.tailwindplus.com/logos/16.svg?color=black&width=120"
                  className="dark:hidden"
                  alt=""
                  width={146}
                  height={32}
                />
                <img
                  src="https://assets.tailwindplus.com/logos/16.svg?color=white&width=120"
                  className="not-dark:hidden"
                  alt=""
                  width={146}
                  height={32}
                />
              </>
            }
            text="Serving as a tax-efficiency vehicle for investors waiting to move to a tax haven."
            footnote="Investor in Quirk, Looply, Pine Labs and more."
          />
          <BrandCard
            logo={
              <>
                <img
                  src="https://assets.tailwindplus.com/logos/14.svg?color=black&width=80"
                  className="dark:hidden"
                  alt=""
                  width={106}
                  height={32}
                />
                <img
                  src="https://assets.tailwindplus.com/logos/14.svg?color=white&width=80"
                  className="not-dark:hidden"
                  alt=""
                  width={106}
                  height={32}
                />
              </>
            }
            text="Investing in potentially volatile bubble markets at an early stage."
            footnote="Investor in Artifact, Umbra, vivid.ai and more."
          />
        </BrandsCardsMultiColumn>

        {/* Team */}
        <TeamThreeColumnGrid
          id="team"
          headline="Our leadership team"
          subheadline={
            <p>
              Oatmeals's leadership team combines decades of experience in private equity, where they honed their skills
              in cost-cutting and maximizing shareholder value.
            </p>
          }
        >
          <TeamMember
            img={
              <img
                src="https://assets.tailwindplus.com/avatars/1.webp?w=800&h=800"
                alt=""
                className="not-dark:bg-white/75 dark:bg-black/75"
                width={800}
                height={800}
              />
            }
            name="Leslie Alexander"
            byline="Co-Founder / CEO"
          />
          <TeamMember
            img={
              <img
                src="https://assets.tailwindplus.com/avatars/2.webp?w=800&h=800"
                alt=""
                className="not-dark:bg-white/75 dark:bg-black/75"
                width={800}
                height={800}
              />
            }
            name="Michael Foster"
            byline="Co-Founder / CTO"
          />
          <TeamMember
            img={
              <img
                src="https://assets.tailwindplus.com/avatars/7.webp?w=800&h=800"
                alt=""
                className="not-dark:bg-white/75 dark:bg-black/75"
                width={800}
                height={800}
              />
            }
            name="Dries Vincent"
            byline="Business Relations"
          />
        </TeamThreeColumnGrid>

        {/* Features */}
        <FeaturesThreeColumn
          id="features"
          headline="Our values."
          subheadline={
            <p>
              Work smarter, reply faster, and keep every customer conversation right where it belongs — in one simple
              inbox, where you can ignore it.
            </p>
          }
          features={
            <>
              <Feature
                icon={<RocketIcon />}
                headline="Innovation"
                subheadline={
                  <p>
                    We are constantly pushing the boundaries of what's possible, and legal, in customer support to
                    deliver cutting-edge solutions for our clients.
                  </p>
                }
              />
              <Feature
                icon={<HeartIcon />}
                headline="Integrity"
                subheadline={
                  <p>
                    We are driven by a commitment to ethical business practices, transparency, and most of all,
                    maximizing shareholder value.
                  </p>
                }
              />
              <Feature
                icon={<GitDiffIcon />}
                headline="Collaboration"
                subheadline={
                  <p>
                    We believe teamwork makes the dream work, especially when that dream is offshoring local jobs to the
                    lowest bidder.
                  </p>
                }
              />
              <Feature
                icon={<User2Icon />}
                headline="Diversity"
                subheadline={
                  <p>
                    Diversity can mean many things, but to us it mainly means hiring people from countries with the
                    lowest labour costs.
                  </p>
                }
              />
              <Feature
                icon={<TargetIcon />}
                headline="Accountability"
                subheadline={
                  <p>
                    Our customers' success is our success and their failure is our failure, except in the legal sense
                    where our liability is limited.
                  </p>
                }
              />
              <Feature
                icon={<StarIcon />}
                headline="Quality"
                subheadline={
                  <p>
                    We believe that you can move fast without breaking things, unless those things are labour laws in
                    third world countries.
                  </p>
                }
              />
            </>
          }
        />

        {/* Call To Action */}
        <CallToActionSimple
          id="call-to-action"
          headline="Have anymore questions?"
          subheadline={
            <p>Chat to someone on our sales team, who will make promises about our roadmap that we won't keep.</p>
          }
          cta={
            <div className="flex items-center gap-4">
              <ButtonLink href="#" size="lg">
                Chat with us
              </ButtonLink>

              <PlainButtonLink href="#" size="lg">
                Book a demo <ChevronIcon />
              </PlainButtonLink>
            </div>
          }
        />
      </Main>

      <FooterWithLinkCategories
        id="footer"
        links={
          <>
            <FooterCategory title="Product">
              <FooterLink href="#">Features</FooterLink>
              <FooterLink href="#">Pricing</FooterLink>
              <FooterLink href="#">Integrations</FooterLink>
            </FooterCategory>
            <FooterCategory title="Company">
              <FooterLink href="#">About</FooterLink>
              <FooterLink href="#">Careers</FooterLink>
              <FooterLink href="#">Blog</FooterLink>
              <FooterLink href="#">Press Kit</FooterLink>
            </FooterCategory>
            <FooterCategory title="Resources">
              <FooterLink href="#">Help Center</FooterLink>
              <FooterLink href="#">API Docs</FooterLink>
              <FooterLink href="#">Status</FooterLink>
              <FooterLink href="#">Contact</FooterLink>
            </FooterCategory>
            <FooterCategory title="Legal">
              <FooterLink href="#">Privacy Policy</FooterLink>
              <FooterLink href="#">Terms of Service</FooterLink>
              <FooterLink href="#">Security</FooterLink>
            </FooterCategory>
            <FooterCategory title="Connect">
              <FooterLink href="#">X</FooterLink>
              <FooterLink href="#">GitHub</FooterLink>
              <FooterLink href="#">YouTube</FooterLink>
            </FooterCategory>
          </>
        }
        fineprint="© 2025 Oatmeal, Inc."
      />
    </>
  )
}
